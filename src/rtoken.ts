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

import { Account, Market, LiquidationBorrow } from "../generated/schema";
import {
  cTokenDecimals,
  cTokenDecimalsBD,
  createAccount,
  exponentToBigDecimal,
  mantissaFactorBD,
  updateCommonCTokenStats,
  zeroBD,
  priceOracle,
  comptrollerAddress,
} from "./helpers";
import { createMarket, updateMarket } from "./markets";
import { PriceFeed } from "../generated/Comptroller/PriceFeed";
import { Comptroller } from "../generated/Comptroller/Comptroller";

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

  usdPrice = usdPrice.div(mantissaFactorBD);

  log.info(`*** DISPLAY *** : usdPrice: ${usdPrice}`, [account.id]);

  let borrowAmountBD = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.borrowAmount.toBigDecimal().div(underlyingDecimals);

  log.info(`*** DISPLAY *** : borrowAmountBD {}:`, [borrowAmountBD.toString()]);

  let previousBorrow = cTokenStats.storedBorrowBalance;

  cTokenStats.totalUnderlyingBorrowed = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.accountBorrows
        .toBigDecimal()
        .div(underlyingDecimals)
        .truncate(market.underlyingDecimals);
  cTokenStats.storedBorrowBalanceUSD =
    cTokenStats.totalUnderlyingBorrowed.times(usdPrice);

  cTokenStats.storedBorrowBalance = cTokenStats.totalUnderlyingBorrowed.div(
    market.exchangeRate
  );

  cTokenStats.accountBorrowIndex = market.borrowIndex;

  cTokenStats.save();

  if (account) {
    const borrowAmountDelta = usdPrice.times(borrowAmountBD);
    account.totalBorrowValueInEth =
      account.totalBorrowValueInEth.plus(borrowAmountDelta);

    log.info(
      `*** BORROW CALCULATION *** : totalBorrowValueInEth: borrowAmountDelta ${borrowAmountDelta}, usdPrice ${usdPrice},  borrowAmountBD ${borrowAmountBD}, cTokenDecimalsBD ${cTokenDecimalsBD}, exchangeRate ${market.exchangeRate}`,
      [account.id]
    );
    account.save();
  }
  let comptroller = Comptroller.bind(Address.fromString(comptrollerAddress));
  let accountLpInfo = comptroller.try_getAccountLiquidity(
    Address.fromString(account.id)
  );
  if (accountLpInfo.reverted) {
    log.warning("Call to getAccountLiquidity reverted for account: {}", [
      account.id,
    ]);
  } else {
    account.liquitity = accountLpInfo.value.value1.toBigDecimal();
    account.shortfall = accountLpInfo.value.value2.toBigDecimal();
    account.hasBorrowed = true;
    account.save();
  }

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

  if (!market) {
    return;
  }

  let accountID = event.params.borrower.toHex();
  let oracleAddress = Address.fromString(priceOracle);
  let oracle = PriceFeed.bind(oracleAddress);
  let currentPrice = oracle.try_getPrice(event.address);

  let usdPrice: BigDecimal;

  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }

  let account = Account.load(accountID);
  if (account == null) {
    account = createAccount(accountID);
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
  usdPrice = usdPrice.div(mantissaFactorBD);

  let repayAmountBD = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.repayAmount.toBigDecimal().div(underlyingDecimals);

  cTokenStats.totalUnderlyingBorrowed = underlyingDecimals.equals(zeroBD)
    ? zeroBD
    : event.params.accountBorrows
        .toBigDecimal()
        .div(underlyingDecimals)
        .truncate(market.underlyingDecimals);
  cTokenStats.storedBorrowBalanceUSD =
    cTokenStats.totalUnderlyingBorrowed.times(usdPrice);
  cTokenStats.storedBorrowBalance = cTokenStats.totalUnderlyingBorrowed.div(
    market.exchangeRate
  );

  cTokenStats.accountBorrowIndex = market.borrowIndex;
  cTokenStats.totalUnderlyingRepaid =
    cTokenStats.totalUnderlyingRepaid.plus(repayAmountBD);

  cTokenStats.save();

  if (account) {
    const repayAmountDelta = repayAmountBD.times(usdPrice);
    // .times(market.exchangeRate);

    account.totalBorrowValueInEth =
      account.totalBorrowValueInEth.minus(repayAmountDelta);
      log.info(`*** DISPLAY *** : totalBorrowValueInEth after repay: ${account.totalBorrowValueInEth.toString()}`, []);
  }
  let comptroller = Comptroller.bind(Address.fromString(comptrollerAddress));
  let accountLpInfo = comptroller.try_getAccountLiquidity(
    Address.fromString(account.id)
  );
  if (accountLpInfo.reverted) {
    log.warning("Call to getAccountLiquidity reverted for account: {}", [
      account.id,
    ]);
  } else {
    account.liquitity = accountLpInfo.value.value1.toBigDecimal();
    account.shortfall = accountLpInfo.value.value2.toBigDecimal();
    account.hasBorrowed = true;
    account.save();
  }

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

  // 加载或创建清算人账户
  let liquidatorID = event.params.liquidator.toHex();
  let liquidator = Account.load(liquidatorID);
  if (liquidator == null) {
    liquidator = createAccount(liquidatorID);
  }
  liquidator.countLiquidator = liquidator.countLiquidator + 1;

  // 加载或创建被清算人账户
  let borrowerID = event.params.borrower.toHex();
  let borrower = Account.load(borrowerID);
  if (borrower == null) {
    borrower = createAccount(borrowerID);
  }
  borrower.countLiquidated = borrower.countLiquidated + 1;

  // 创建并保存 LiquidationEvent 实体
  let liquidationEvent = new LiquidationBorrow(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );
  liquidationEvent.liquidator = liquidatorID;
  liquidationEvent.borrower = event.params.borrower;
  liquidationEvent.repayAmount = event.params.repayAmount;
  liquidationEvent.seizeTokens = event.params.seizeTokens;
  liquidationEvent.rTokenCollateral = event.params.rTokenCollateral;
  liquidationEvent.blockNumber = event.block.number;
  liquidationEvent.blockTimestamp = event.block.timestamp;
  liquidationEvent.transactionHash = event.transaction.hash;
  liquidationEvent.save();

  // 加载或创建市场
  let marketID = event.params.rTokenCollateral.toHex();
  let market = Market.load(marketID);
  if (!market) {
    market = createMarket(marketID);
  }

  // 获取价格
  let oracleAddress = Address.fromString(priceOracle);
  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(event.params.rTokenCollateral);
  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }
  // 获取cToken的精度
  let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);
  // 调整usdPrice的精度
  usdPrice = usdPrice.div(mantissaFactorBD);

  // let repayAmountUSD = event.params.repayAmount.toBigDecimal().div(underlyingDecimals).times(usdPrice).times(market.exchangeRate);
  // borrower.totalBorrowValueInEth = borrower.totalBorrowValueInEth.minus(repayAmountUSD);
  // log.info(`*** DISPLAY *** : totalBorrowValueInEth after liquidation: ${borrower.totalBorrowValueInEth.toString()}`, []);

  // let cTokenStats = updateCommonCTokenStats(
  //   market.id,
  //   market.symbol,
  //   borrowerID,
  //   event.transaction.hash,
  //   event.block.timestamp.toI32(),
  //   event.block.number.toI32()
  // );

  // let repayAmountBD = event.params.repayAmount.toBigDecimal().div(underlyingDecimals);
  // cTokenStats.totalUnderlyingBorrowed = cTokenStats.totalUnderlyingBorrowed.minus(repayAmountBD);
  // cTokenStats.save();

  // 更新清算人和借款人的liquitity和shortfall
  let comptroller = Comptroller.bind(Address.fromString(comptrollerAddress));
  let borrowerLpInfo = comptroller.try_getAccountLiquidity(
    Address.fromString(borrowerID)
  );
  if (borrowerLpInfo.reverted) {
    log.warning("Call to getAccountLiquidity reverted for account: {}", [
      borrowerID,
    ]);
  } else {
    borrower.liquitity = borrowerLpInfo.value.value1.toBigDecimal();
    borrower.shortfall = borrowerLpInfo.value.value2.toBigDecimal();
    borrower.save();
  }

  let liquidatorLpInfo = comptroller.try_getAccountLiquidity(
    Address.fromString(liquidatorID)
  );
  if (liquidatorLpInfo.reverted) {
    log.warning("Call to getAccountLiquidity reverted for account: {}", [
      liquidatorID,
    ]);
  } else {
    liquidator.liquitity = liquidatorLpInfo.value.value1.toBigDecimal();
    liquidator.shortfall = liquidatorLpInfo.value.value2.toBigDecimal();
    liquidator.save();
  }
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
  let account = Account.load(event.params.to.toHex());
  if (!market) {
    return;
  }
  // 绑定价格预言机合约
  let oracleAddress = Address.fromString(priceOracle);
  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(event.address);
  // 获取cToken的当前价格
  if (currentPrice.reverted) {
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }

  // 如果市场的accrualBlockNumber与当前区块不同，则更新市场
  if (market.accrualBlockNumber != event.block.number.toI32()) {
    market = updateMarket(
      event.address,
      event.block.number.toI32(),
      event.block.timestamp.toI32()
    );
  }

  // 获取底层资产的精度
  let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);
  // 调整usdPrice的精度
  usdPrice = usdPrice.div(mantissaFactorBD);

  // 计算底层资产的数量
  let amountUnderlying = market.exchangeRate.times(
    cTokenDecimalsBD.equals(zeroBD)
      ? zeroBD
      : event.params.amount.toBigDecimal().div(underlyingDecimals)
  );

  let amountUnderylingTruncated = amountUnderlying.truncate(
    market.underlyingDecimals
  );

  let accountFromID = event.params.from.toHex();
  let accountToID = event.params.to.toHex();

  // Checking if the tx is FROM the cToken contract (i.e. this will not run when minting)
  // If so, it is a mint, and we don't need to run these calculations
  // 检查转出账户是否为cToken合约地址（即，提现事件）
  if (accountFromID != marketID) {
    let accountFrom = Account.load(accountFromID);
    if (accountFrom == null) {
      accountFrom = createAccount(accountFromID);
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
        : event.params.amount.toBigDecimal().div(underlyingDecimals)
    );
    cTokenStatsFrom.cTokenBalanceUSD =
      cTokenStatsFrom.cTokenBalance.times(usdPrice);
    cTokenStatsFrom.totalUnderlyingSupplied = cTokenStatsFrom.cTokenBalance.div(
      market.exchangeRate
    );

    cTokenStatsFrom.totalUnderlyingRedeemed =
      cTokenStatsFrom.totalUnderlyingRedeemed.plus(amountUnderylingTruncated);
    cTokenStatsFrom.save();

    const collateralDelta = amountUnderlying.times(usdPrice);
    accountFrom.totalCollateralValueInEth =
      accountFrom.totalCollateralValueInEth.minus(collateralDelta);
    accountFrom.save();
    if (cTokenStatsFrom.cTokenBalance.equals(zeroBD)) {
      market.numberOfSuppliers = market.numberOfSuppliers - 1;
      market.save();
    }


  }
  // Checking if the tx is TO the cToken contract (i.e. this will not run when redeeming)
  // If so, we ignore it. this leaves an edge case, where someone who accidentally sends
  // cTokens to a cToken contract, where it will not get recorded. Right now it would
  // be messy to include, so we are leaving it out for now TODO fix this in future
  // 检查转入账户是否为cToken合约地址
  if (accountToID != marketID) {
    let accountTo = Account.load(accountToID);
    if (accountTo == null) {
      accountTo = createAccount(accountToID);
    }

    // Update cTokenStats common for all events, and return the stats to update unique
    // values for each event
    // 更新转入账户的cToken统计信息
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
        : event.params.amount.toBigDecimal().div(underlyingDecimals)
    );

    cTokenStatsTo.cTokenBalanceUSD = cTokenStatsTo.cTokenBalance
      .times(usdPrice)
      .times(market.exchangeRate);
    cTokenStatsTo.totalUnderlyingSupplied = cTokenStatsTo.cTokenBalance.div(
      market.exchangeRate
    );

    cTokenStatsTo.save();

    if (
      previousCTokenBalanceTo.equals(zeroBD) &&
      !event.params.amount.toBigDecimal().equals(zeroBD) // checking edge case for transfers of 0
    ) {
      market.numberOfSuppliers = market.numberOfSuppliers + 1;
      market.save();
    }

    if (accountTo) {
      const cTokenBalanceDelta = event.params.amount
        .toBigDecimal()
        .times(usdPrice)
        .times(market.exchangeRate)
        .div(underlyingDecimals);

      accountTo.totalCollateralValueInEth =
        accountTo.totalCollateralValueInEth.plus(cTokenBalanceDelta);

      log.info(
        `*** SUPPLY CALCULATION *** : AmountIn ${event.params.amount} totalCollateralValueInEth: cTokenBalanceDelta ${cTokenBalanceDelta} cTokenBalance ${cTokenStatsTo.cTokenBalance}, usdPrice ${usdPrice}, cTokenDecimalsBD ${cTokenDecimalsBD}, exchangeRate ${market.exchangeRate}`,
        [accountTo.id]
      );
      let comptroller = Comptroller.bind(
        Address.fromString(comptrollerAddress)
      );

      let accountLpInfo = comptroller.try_getAccountLiquidity(
        Address.fromString(accountTo.id)
      );
      if (accountLpInfo.reverted) {
        log.warning("Call to getAccountLiquidity reverted for account: {}", [
          accountTo.id,
        ]);
      } else {
        accountTo.liquitity = accountLpInfo.value.value1.toBigDecimal();
        accountTo.shortfall = accountLpInfo.value.value2.toBigDecimal();
        accountTo.hasBorrowed = true;
        accountTo.save();
      }
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
