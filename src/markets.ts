/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import {
  Address,
  BigDecimal,
  BigInt,
  log,
} from "@graphprotocol/graph-ts/index";
import { Comptroller, Market } from "../generated/schema";
import {
  cTokenDecimalsBD,
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  newPriceOracle,
  priceOracle,
  rETHAddress,
  rUSDCAddress,
  replaceBlockNumber,
  zeroBD,
} from "./helpers";

import { ERC20 } from "../generated/rSTONE/ERC20";
import { PriceFeed } from "../generated/Comptroller/PriceFeed";
import { RERC20 } from "../generated/rSTONE/RERC20";
import { RToken } from "../generated/rSTONE/RToken";

// Used for all cERC20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32
): BigDecimal {
  let comptroller = Comptroller.load("1");

  if (!comptroller) return BigDecimal.fromString("0");

  let oracleAddress: Address;

  if (blockNumber > replaceBlockNumber) {
    oracleAddress = Address.fromString(newPriceOracle);
  } else {
    oracleAddress = Address.fromString(priceOracle);
  }

  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(eventAddress);

  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal();
  }

  usdPrice = usdPrice.div(mantissaFactorBD);
  return usdPrice;
}

// Returns the price of USDC in eth. i.e. 0.005 would mean ETH is $200
function getUSDCpriceETH(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load("1");
  if (!comptroller) return BigDecimal.zero();

  let oracleAddress: Address;
  if (blockNumber > replaceBlockNumber) {
    oracleAddress = Address.fromString(newPriceOracle);
  } else {
    oracleAddress = Address.fromString(priceOracle);
  }

  let oracle = PriceFeed.bind(oracleAddress);
  let usdPrice: BigDecimal;

  let currentPrice = oracle.try_getPrice(Address.fromString(rUSDCAddress));

  if (currentPrice.reverted) {
    log.info("*** CALL FAILED *** : ERC20: getPrice() reverted.", [
      oracleAddress.toHex(),
    ]);
    usdPrice = zeroBD;
  } else {
    usdPrice = currentPrice.value.toBigDecimal().div(mantissaFactorBD);
  }

  return usdPrice;
}

export function createMarket(marketAddress: string): Market {
  let market: Market;
  let contract = RERC20.bind(Address.fromString(marketAddress));

  // It is CETH, which has a slightly different interface
  if (contract.isEthDerivative()) {
    market = new Market(marketAddress);
    market.underlyingAddress = Address.fromString(
      "0x0000000000000000000000000000000000000000"
    );
    market.underlyingDecimals = 18;
    market.underlyingPrice = zeroBD;
    market.underlyingName = "Ether";
    market.underlyingSymbol = "ETH";

    // It is all other CERC20 contracts
  } else {
    market = new Market(marketAddress);
    market.underlyingAddress = contract.underlying();
    let underlyingContract = ERC20.bind(contract.underlying());
    let decimals = underlyingContract.try_decimals();

    if (decimals.reverted) {
      log.info("*** CALL FAILED *** : ERC20: decimals() reverted.", [
        market.underlyingAddress.toHex(),
      ]);
      market.underlyingDecimals = 0;
    } else {
      market.underlyingDecimals = decimals.value;
    }

    let name = underlyingContract.try_name();
    let symbol = underlyingContract.try_symbol();
    if (name.reverted) {
      log.info("*** CALL FAILED *** : ERC20: name() reverted.", [
        market.underlyingAddress.toHex(),
      ]);
      market.underlyingName = "";
    } else {
      market.underlyingName = name.value;
    }

    if (symbol.reverted) {
      log.info("*** CALL FAILED *** : ERC20: symbol() reverted.", [
        market.underlyingAddress.toHex(),
      ]);
      market.underlyingSymbol = "";
    } else {
      market.underlyingSymbol = symbol.value;
    }

    if (marketAddress == rUSDCAddress) {
      market.underlyingPriceUSD = BigDecimal.fromString("1");
    }
  }

  market.borrowRate = zeroBD;
  market.cash = zeroBD;
  market.collateralFactor = zeroBD;
  market.exchangeRate = zeroBD;
  market.interestRateModelAddress = Address.fromString(
    "0x0000000000000000000000000000000000000000"
  );
  market.name = contract.name();
  market.numberOfBorrowers = 0;
  market.numberOfSuppliers = 0;
  market.liquidationThresholdUSD = zeroBD;
  market.reserves = zeroBD;
  market.supplyRate = zeroBD;
  market.symbol = contract.symbol();
  market.totalBorrows = zeroBD;
  market.totalSupply = zeroBD;
  market.underlyingPrice = zeroBD;

  market.accrualBlockNumber = 0;
  market.blockTimestamp = 0;
  market.borrowIndex = zeroBD;
  market.reserveFactor = BigInt.fromI32(0);
  market.underlyingPriceUSD = zeroBD;

  return market;
}

export function updateMarket(
  marketAddress: Address,
  blockNumber: i32,
  blockTimestamp: i32
): Market {
  let marketID = marketAddress.toHexString();
  let market = Market.load(marketID);
  if (market == null) {
    market = createMarket(marketID);
  }

  // Only updateMarket if it has not been updated this block
  if (market.accrualBlockNumber != blockNumber) {
    let contractAddress = Address.fromString(market.id);
    let contract = RToken.bind(contractAddress);
    let usdPriceInEth = getUSDCpriceETH(blockNumber);

    // if cETH, we only update USD price
    if (market.id == rETHAddress) {
      market.underlyingPriceUSD = usdPriceInEth.equals(zeroBD)
        ? zeroBD
        : market.underlyingPrice
            .div(usdPriceInEth)
            .truncate(market.underlyingDecimals);
    } else {
      let tokenPriceEth = getTokenPrice(
        blockNumber,
        contractAddress,
        Address.fromBytes(market.underlyingAddress),
        market.underlyingDecimals
      );
      market.underlyingPrice = tokenPriceEth.truncate(
        market.underlyingDecimals
      );
      // if USDC, we only update ETH price
      if (market.id != rUSDCAddress) {
        market.underlyingPriceUSD = usdPriceInEth.equals(zeroBD)
          ? zeroBD
          : market.underlyingPrice
              .div(usdPriceInEth)
              .truncate(market.underlyingDecimals);
      }
    }

    market.accrualBlockNumber = contract.accrualBlockNumber().toI32();
    market.blockTimestamp = blockTimestamp;

    if (cTokenDecimalsBD.equals(zeroBD)) {
      market.totalSupply = zeroBD;
    } else {
      const totalSupply = contract.try_totalSupply();
      if (totalSupply.reverted) {
        log.info("*** CALL FAILED *** : totalSupply() reverted.", [
          market.id.toString(),
        ]);
        market.totalSupply = zeroBD;
      } else {
        market.totalSupply = totalSupply.value
          .toBigDecimal()
          .div(exponentToBigDecimal(market.underlyingDecimals))
          .truncate(market.underlyingDecimals);
      }
    }

    market.liquidationThresholdUSD = market.totalSupply
      .times(market.underlyingPrice)
      .times(market.collateralFactor);

    /* Exchange rate explanation
       In Practice
        - If you call the cDAI contract on etherscan it comes back (2.0 * 10^26)
        - If you call the cUSDC contract on etherscan it comes back (2.0 * 10^14)
        - The real value is ~0.02. So cDAI is off by 10^28, and cUSDC 10^16
       How to calculate for tokens with different decimals
        - Must div by tokenDecimals, 10^market.underlyingDecimals
        - Must multiply by ctokenDecimals, 10^8
        - Must div by mantissa, 10^18
     */
    let underlyingDecimals = exponentToBigDecimal(market.underlyingDecimals);

    if (underlyingDecimals.equals(zeroBD) || cTokenDecimalsBD.equals(zeroBD)) {
      market.exchangeRate = zeroBD;
    } else {
      market.exchangeRate = contract
        .exchangeRateStored()
        .toBigDecimal()
        .div(exponentToBigDecimal(mantissaFactor));
    }
    if (mantissaFactorBD.equals(zeroBD)) {
      market.borrowIndex = zeroBD;
      market.supplyRate = zeroBD;
    } else {
      const borrowIndex = contract.try_borrowIndex();
      if (borrowIndex.reverted) {
        log.info("*** CALL FAILED *** : RERC20: borrowIndex() reverted.", [
          market.underlyingAddress.toHex(),
        ]);
        market.borrowIndex = zeroBD;
      } else {
        market.borrowIndex = borrowIndex.value
          .toBigDecimal()
          .div(mantissaFactorBD)
          .truncate(mantissaFactor);
      }

      const supplyRatePerBlock = contract.try_supplyRatePerBlock();
      if (supplyRatePerBlock.reverted) {
        log.info(
          "*** CALL FAILED *** : RERC20: supplyRatePerBlock() reverted.",
          [market.underlyingAddress.toHex()]
        );
        market.supplyRate = zeroBD;
      } else {
        market.supplyRate = supplyRatePerBlock.value.toBigDecimal();
      }
    }

    if (underlyingDecimals.equals(zeroBD)) {
      market.reserves = zeroBD;
      market.totalBorrows = zeroBD;
      market.cash = zeroBD;
    } else {
      const totalReserves = contract.try_totalReserves();
      if (totalReserves.reverted) {
        log.info("*** CALL FAILED *** : RERC20: totalReserves() reverted.", [
          market.underlyingAddress.toHex(),
        ]);
        market.reserves = zeroBD;
      } else {
        market.reserves = totalReserves.value
          .toBigDecimal()
          .div(exponentToBigDecimal(market.underlyingDecimals))
          .truncate(market.underlyingDecimals);
      }

      const totalBorrows = contract.try_totalBorrows();

      if (totalBorrows.reverted) {
        log.info("*** CALL FAILED *** : RERC20: totalBorrows() reverted.", [
          market.underlyingAddress.toHex(),
        ]);
        market.totalBorrows = zeroBD;
      } else {
        market.totalBorrows = totalBorrows.value
          .toBigDecimal()
          .div(exponentToBigDecimal(market.underlyingDecimals))
          .truncate(market.underlyingDecimals);
      }

      const cash = contract.try_getCash();

      if (cash.reverted) {
        log.info("*** CALL FAILED *** : RERC20: getCash() reverted.", [
          market.underlyingAddress.toHex(),
        ]);
        market.cash = zeroBD;
      } else {
        market.cash = cash.value
          .toBigDecimal()
          .div(exponentToBigDecimal(market.underlyingDecimals))
          .truncate(market.underlyingDecimals);
      }
    }

    // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let borrowRatePerBlock = contract.try_borrowRatePerBlock();
    if (borrowRatePerBlock.reverted) {
      log.info("***CALL FAILED*** : cERC20 borrowRatePerBlock() reverted", []);
      market.borrowRate = zeroBD;
    } else {
      if (mantissaFactorBD.equals(zeroBD)) {
        market.borrowRate = zeroBD;
      } else {
        market.borrowRate = borrowRatePerBlock.value.toBigDecimal();
      }
    }
    market.save();
  }
  return market as Market;
}
