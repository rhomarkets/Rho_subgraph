import { Address, BigDecimal, log } from "@graphprotocol/graph-ts";
import {
  AccrueInterest,
  Borrow,
  LiquidateBorrow,
  NewMarketInterestRateModel,
  NewReserveFactor,
  RepayBorrow,
  Transfer,
} from "../generated/rSTONE/RToken";
import { Account, Market } from "../generated/schema";
import {
  cTokenDecimals,
  cTokenDecimalsBD,
  createAccount,
  exponentToBigDecimal,
  mantissaFactorBD,
  updateCommonCTokenStats,
  zeroBD,
} from "./helpers";
import { createMarket, updateMarket } from "./markets";
import { PriceFeed } from "../generated/Comptroller/PriceFeed";

const priceOracle = "0x4AeAe096614E5Bc1e124d6326F18A06C8FFd1665";

/* Borrow assets from the protocol. All values either ETH or ERC20
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account
 * event.params.borrowAmount = that was added in this event
 * event.params.borrower = the account
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 */
export function handleBorrow(event: Borrow): void {
  let market = Market.load(event.address.toHex());
  let accountID = event.params.borrower.toHex();

  let account = Account.load(accountID);
  if (account == null) {
    account = createAccount(accountID);
  }

  if (!market) {
    return;
  }

  let oracleAddress = Address.fromString(priceOracle);
  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(event.address);

  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }

  usdPrice = usdPrice.div(mantissaFactorBD);

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp.toI32(),
    event.block.number.toI32()
  );

  let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);

  let borrowAmountBD = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.borrowAmount.toBigDecimal().div(underlyingDecimals);
  let previousBorrow = cTokenStats.storedBorrowBalance;

  cTokenStats.storedBorrowBalance = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.accountBorrows
        .toBigDecimal()
        .div(underlyingDecimals)
        .truncate(market.underlyingDecimals);

  cTokenStats.accountBorrowIndex = market.borrowIndex;
  cTokenStats.totalUnderlyingBorrowed =
    cTokenStats.totalUnderlyingBorrowed.plus(borrowAmountBD);

  cTokenStats.totalUnderlyingBorrowedUSD =
    cTokenStats.totalUnderlyingBorrowed.times(market.underlyingPrice);

  cTokenStats.save();

  account.hasBorrowed = true;
  account.save();

  if (
    previousBorrow.equals(zeroBD) &&
    !event.params.accountBorrows.toBigDecimal().equals(zeroBD) // checking edge case for borrwing 0
  ) {
    market.numberOfBorrowers = market.numberOfBorrowers + 1;
    market.save();
  }
}

/* Repay some amount borrowed. Anyone can repay anyones balance
 *
 * event.params.totalBorrows = of the whole market (not used right now)
 * event.params.accountBorrows = total of the account (not used right now)
 * event.params.repayAmount = that was added in this event
 * event.params.borrower = the borrower
 * event.params.payer = the payer
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this
 *    Once a account totally repays a borrow, it still has its account interest index set to the
 *    markets value. We keep this, even though you might think it would reset to 0 upon full
 *    repay.
 */
export function handleRepayBorrow(event: RepayBorrow): void {
  let market = Market.load(event.address.toHexString());
  let accountID = event.params.borrower.toHex();

  let account = Account.load(accountID);
  if (account == null) {
    createAccount(accountID);
  }

  if (!market) {
    return;
  }

  // Update cTokenStats common for all events, and return the stats to update unique
  // values for each event
  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp.toI32(),
    event.block.number.toI32()
  );
  let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);

  let repayAmountBD = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.repayAmount.toBigDecimal().div(underlyingDecimals);

  cTokenStats.storedBorrowBalance = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.accountBorrows
        .toBigDecimal()
        .div(underlyingDecimals)
        .truncate(market.underlyingDecimals);

  cTokenStats.accountBorrowIndex = market.borrowIndex;
  cTokenStats.totalUnderlyingRepaid =
    cTokenStats.totalUnderlyingRepaid.plus(repayAmountBD);
  cTokenStats.save();

  if (cTokenStats.storedBorrowBalance.equals(zeroBD)) {
    market.numberOfBorrowers = market.numberOfBorrowers - 1;
    market.save();
  }
}

/*
 * Liquidate an account who has fell below the collateral factor.
 *
 * event.params.borrower - the borrower who is getting liquidated of their cTokens
 * event.params.cTokenCollateral - the market ADDRESS of the ctoken being liquidated
 * event.params.liquidator - the liquidator
 * event.params.repayAmount - the amount of underlying to be repaid
 * event.params.seizeTokens - cTokens seized (transfer event should handle this)
 *
 * Notes
 *    No need to updateMarket(), handleAccrueInterest() ALWAYS runs before this.
 *    When calling this function, event RepayBorrow, and event Transfer will be called every
 *    time. This means we can ignore repayAmount. Seize tokens only changes state
 *    of the cTokens, which is covered by transfer. Therefore we only
 *    add liquidation counts in this handler.
 */
export function handleLiquidateBorrow(event: LiquidateBorrow): void {
  let liquidatorID = event.params.liquidator.toHex();
  let liquidator = Account.load(liquidatorID);
  if (liquidator == null) {
    liquidator = createAccount(liquidatorID);
  }
  liquidator.countLiquidator = liquidator.countLiquidator + 1;
  liquidator.save();

  let borrowerID = event.params.borrower.toHex();
  let borrower = Account.load(borrowerID);
  if (borrower == null) {
    borrower = createAccount(borrowerID);
  }
  borrower.countLiquidated = borrower.countLiquidated + 1;
  borrower.save();
}

/* Transferring of cTokens
 *
 * event.params.from = sender of cTokens
 * event.params.to = receiver of cTokens
 * event.params.amount = amount sent
 *
 * Notes
 *    Possible ways to emit Transfer:
 *      seize() - i.e. a Liquidation Transfer (does not emit anything else)
 *      redeemFresh() - i.e. redeeming your cTokens for underlying asset
 *      mintFresh() - i.e. you are lending underlying assets to create ctokens
 *      transfer() - i.e. a basic transfer
 *    This function handles all 4 cases. Transfer is emitted alongside the mint, redeem, and seize
 *    events. So for those events, we do not update cToken balances.
 */
export function handleTransfer(event: Transfer): void {
  // We only updateMarket() if accrual block number is not up to date. This will only happen
  // with normal transfers, since mint, redeem, and seize transfers will already run updateMarket()
  let marketID = event.address.toHexString();
  let market = Market.load(marketID);
  if (!market) {
    return;
  }

  let oracleAddress = Address.fromString(priceOracle);
  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(event.address);

  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }
  usdPrice = usdPrice.div(mantissaFactorBD);

  if (market.accrualBlockNumber != event.block.number.toI32()) {
    market = updateMarket(
      event.address,
      event.block.number.toI32(),
      event.block.timestamp.toI32()
    );
  }

  let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);

  let amountUnderlying = market.exchangeRate.times(
    cTokenDecimalsBD.equals(zeroBD)
      ? zeroBD
      : event.params.amount.toBigDecimal().div(underlyingDecimals)
  );

  let amountUnderylingTruncated = amountUnderlying.truncate(
    market.underlyingDecimals
  );

  let accountFromID = event.params.from.toHex();

  // Checking if the tx is FROM the cToken contract (i.e. this will not run when minting)
  // If so, it is a mint, and we don't need to run these calculations
  if (accountFromID != marketID) {
    let accountFrom = Account.load(accountFromID);
    if (accountFrom == null) {
      createAccount(accountFromID);
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsFrom = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountFromID,
      event.transaction.hash,
      event.block.timestamp.toI32(),
      event.block.number.toI32()
    );

    cTokenStatsFrom.cTokenBalance = cTokenStatsFrom.cTokenBalance.minus(
      cTokenDecimalsBD.equals(zeroBD)
        ? zeroBD
        : event.params.amount
            .toBigDecimal()
            .div(cTokenDecimalsBD)
            .truncate(cTokenDecimals)
    );

    cTokenStatsFrom.totalUnderlyingRedeemed =
      cTokenStatsFrom.totalUnderlyingRedeemed.plus(amountUnderylingTruncated);
    cTokenStatsFrom.save();

    if (cTokenStatsFrom.cTokenBalance.equals(zeroBD)) {
      market.numberOfSuppliers = market.numberOfSuppliers - 1;
      market.save();
    }
  }

  let accountToID = event.params.to.toHex();
  // Checking if the tx is TO the cToken contract (i.e. this will not run when redeeming)
  // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
  // cTokens to a cToken contract, where it will not get recorded. Right now it would
  // be messy to include, so we are leaving it out for now TODO fix this in future
  if (accountToID != marketID) {
    let accountTo = Account.load(accountToID);
    if (accountTo == null) {
      createAccount(accountToID);
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    let cTokenStatsTo = updateCommonCTokenStats(
      market.id,
      market.symbol,
      accountToID,
      event.transaction.hash,
      event.block.timestamp.toI32(),
      event.block.number.toI32()
    );

    let previousCTokenBalanceTo = cTokenStatsTo.cTokenBalance;
    cTokenStatsTo.cTokenBalance = cTokenStatsTo.cTokenBalance.plus(
      cTokenDecimalsBD.equals(zeroBD)
        ? zeroBD
        : event.params.amount
            .toBigDecimal()
            .div(cTokenDecimalsBD)
            .truncate(cTokenDecimals)
    );

    cTokenStatsTo.totalUnderlyingSupplied =
      cTokenStatsTo.totalUnderlyingSupplied.plus(amountUnderylingTruncated);
    cTokenStatsTo.totalUnderlyingSuppliedUSD =
      cTokenStatsTo.totalUnderlyingSupplied.times(market.underlyingPrice);
    cTokenStatsTo.save();

    if (
      previousCTokenBalanceTo.equals(zeroBD) &&
      !event.params.amount.toBigDecimal().equals(zeroBD) // checking edge case for transfers of 0
    ) {
      market.numberOfSuppliers = market.numberOfSuppliers + 1;
      market.save();
    }
  }
}

export function handleAccrueInterest(event: AccrueInterest): void {
  updateMarket(
    event.address,
    event.block.number.toI32(),
    event.block.timestamp.toI32()
  );
}

export function handleNewReserveFactor(event: NewReserveFactor): void {
  let marketID = event.address.toHex();
  let market = Market.load(marketID);
  if (!market) {
    return;
  }
  market.reserveFactor = event.params.newReserveFactorMantissa;
  market.save();
}

export function handleNewMarketInterestRateModel(
  event: NewMarketInterestRateModel
): void {
  let marketID = event.address.toHex();
  let market = Market.load(marketID);
  if (market == null) {
    market = createMarket(marketID);
  }
  market.interestRateModelAddress = event.params.newInterestRateModel;
  market.save();
}
