import {
  MarketEntered as MarketEnteredEvent,
  MarketExited as MarketExitedEvent,
  NewCloseFactor,
  NewCollateralFactor,
  NewLiquidationIncentive,
  NewPriceOracle,
} from "../generated/Comptroller/Comptroller";
import { Comptroller, Market } from "../generated/schema";

import { mantissaFactorBD, updateCommonCTokenStats } from "./helpers";

export function handleMarketEntered(event: MarketEnteredEvent): void {
  let market = Market.load(event.params.rToken.toHexString());

  if (!market) {
    return;
  }

  let accountID = event.params.account.toHex();
  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp.toI32(),
    event.block.number.toI32()
  );
  cTokenStats.enteredMarket = true;
  cTokenStats.save();
}

export function handleMarketExited(event: MarketExitedEvent): void {
  let market = Market.load(event.params.rToken.toHexString());
  let accountID = event.params.account.toHex();

  if (!market) {
    return;
  }

  let cTokenStats = updateCommonCTokenStats(
    market.id,
    market.symbol,
    accountID,
    event.transaction.hash,
    event.block.timestamp.toI32(),
    event.block.number.toI32()
  );
  cTokenStats.enteredMarket = false;
  cTokenStats.save();
}

export function handleNewCloseFactor(event: NewCloseFactor): void {
  let comptroller = Comptroller.load("1");
  if (!comptroller) return;

  comptroller.closeFactor = event.params.newCloseFactorMantissa;
  comptroller.save();
}

export function handleNewCollateralFactor(event: NewCollateralFactor): void {
  let market = Market.load(event.params.rToken.toHexString());

    if (!market) {
    return;
  }

  market.collateralFactor = event.params.newCollateralFactorMantissa
    .toBigDecimal()
    .div(mantissaFactorBD);
  market.save();
}

// This should be the first event acccording to etherscan but it isn't.... price oracle is. weird
export function handleNewLiquidationIncentive(
  event: NewLiquidationIncentive
): void {
  let comptroller = Comptroller.load("1");
  if (!comptroller) return;

  comptroller.liquidationIncentive =
    event.params.newLiquidationIncentiveMantissa;
  comptroller.save();
}

export function handleNewPriceOracle(event: NewPriceOracle): void {
  let comptroller = Comptroller.load("1");
  // This is the first event used in this mapping, so we use it to create the entity
  if (comptroller == null) {
    comptroller = new Comptroller("1");
  }
  comptroller.priceOracle = event.params.newPriceOracle;
  comptroller.save();
}
