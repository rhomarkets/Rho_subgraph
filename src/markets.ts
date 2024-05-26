/* eslint-disable prefer-const */ // to satisfy AS compiler

// For each division by 10, add one to exponent to truncate one significant figure
import {
  Address,
  BigDecimal,
  BigInt,
  log,
} from "@graphprotocol/graph-ts/index";

import {
  exponentToBigDecimal,
  mantissaFactor,
  mantissaFactorBD,
  cTokenDecimalsBD,
  zeroBD,
} from "./helpers";
import { Comptroller, Market } from "../generated/schema";
import { RToken } from "../generated/rSTONE/RToken";
import { RERC20 } from "../generated/rSTONE/RERC20";
import { ERC20 } from "../generated/rSTONE/ERC20";
import { PriceFeed } from "../generated/Comptroller/PriceFeed";

const daiAddress = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359";

const rUSDCAddress = "0xCfFF30BC471C31D2660066797BCFCFe7CF3690B0";
const rETHAddress = "0x50581759977c2caaa5Fde5B62F8C2285a245C336";
const USDCAddress = "0x0223b6C4cE652cCA5fec37f69abCF5DD3Dc1557C";
const priceOracle = "0x04c8D4520aB5C067cEc9Ada61A26A8b46c12aaEA";

// Used for all cERC20 contracts
function getTokenPrice(
  blockNumber: i32,
  eventAddress: Address,
  underlyingAddress: Address,
  underlyingDecimals: i32
): BigDecimal {
  let comptroller = Comptroller.load("1");

  if (!comptroller) return BigDecimal.fromString("0");

  let oracleAddress = Address.fromString(priceOracle);
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
  /* PriceOracle2 is used at the block the Comptroller starts using it.
   * see here https://etherscan.io/address/0x3d9819210a31b4961b30ef54be2aed79b9c9cd3b#events
   * Search for event topic 0xd52b2b9b7e9ee655fcb95d2e5b9e0c9f69e7ef2b8e9d2d0ea78402d576d22e22,
   * and see block 7715908.
   *
   * This must use the cToken address.
   *
   * Note this returns the value without factoring in token decimals and wei, so we must divide
   * the number by (ethDecimals - tokenDecimals) and again by the mantissa.
   * USDC would be 10 ^ ((18 - 6) + 18) = 10 ^ 30
   *
   * Note that they deployed 3 different PriceOracles at the beginning of the Comptroller,
   * and that they handle the decimals different, which can break the subgraph. So we actually
   * defer to Oracle 1 before block 7715908, which works,
   * until this one is deployed, which was used for 121 days */

  // let mantissaDecimalFactor = 18 - underlyingDecimals;
  // let bdFactor = exponentToBigDecimal(mantissaDecimalFactor);
  // let currentUnderlyingPrice = oracle.try_getPrice(eventAddress);

  // if (currentUnderlyingPrice.reverted || bdFactor.equals(zeroBD)) {
  //   log.info("*** CALL FAILED *** : ERC20: getUnderlyingPrice() reverted.", [
  //     oracleAddress.toHex(),
  //   ]);
  //   underlyingPrice = zeroBD;
  // } else {
  //   underlyingPrice = currentUnderlyingPrice.value.toBigDecimal();
  // }

  /* PriceOracle(1) is used (only for the first ~100 blocks of Comptroller. Annoying but we must
   * handle this. We use it for more than 100 blocks, see reason at top of if statement
   * of PriceOracle2.
   *
   * This must use the token address, not the cToken address.
   *
   * Note this returns the value already factoring in token decimals and wei, therefore
   * we only need to divide by the mantissa, 10^18 */

  return usdPrice;
}

// Returns the price of USDC in eth. i.e. 0.005 would mean ETH is $200
function getUSDCpriceETH(blockNumber: i32): BigDecimal {
  let comptroller = Comptroller.load("1");
  if (!comptroller) return BigDecimal.zero();

  let oracleAddress = Address.fromString(priceOracle);
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

    if (market.underlyingAddress.toHexString() != daiAddress) {
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
    market.totalSupply = cTokenDecimalsBD.equals(zeroBD)
      ? zeroBD
      : contract.totalSupply().toBigDecimal().div(cTokenDecimalsBD);

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
        .div(exponentToBigDecimal(mantissaFactor))
        .truncate(mantissaFactor);
    }

    if (mantissaFactorBD.equals(zeroBD)) {
      market.borrowIndex = zeroBD;
      market.supplyRate = zeroBD;
    } else {
      market.borrowIndex = contract
        .borrowIndex()
        .toBigDecimal()
        .div(mantissaFactorBD)
        .truncate(mantissaFactor);

      // Must convert to BigDecimal, and remove 10^18 that is used for Exp in Compound Solidity
      market.supplyRate = contract
        .borrowRatePerBlock()
        .toBigDecimal()
        .times(BigDecimal.fromString("2102400"))
        .div(mantissaFactorBD)
        .truncate(mantissaFactor);
    }

    if (underlyingDecimals.equals(zeroBD)) {
      market.reserves = zeroBD;
      market.totalBorrows = zeroBD;
      market.cash = zeroBD;
    } else {
      market.reserves = contract
        .totalReserves()
        .toBigDecimal()
        .div(exponentToBigDecimal(market.underlyingDecimals))
        .truncate(market.underlyingDecimals);

      market.totalBorrows = contract
        .totalBorrows()
        .toBigDecimal()
        .div(exponentToBigDecimal(market.underlyingDecimals))
        .truncate(market.underlyingDecimals);

      market.cash = contract
        .getCash()
        .toBigDecimal()
        .div(exponentToBigDecimal(market.underlyingDecimals))
        .truncate(market.underlyingDecimals);
    }

    // This fails on only the first call to cZRX. It is unclear why, but otherwise it works.
    // So we handle it like this.
    let supplyRatePerBlock = contract.try_supplyRatePerBlock();
    if (supplyRatePerBlock.reverted) {
      log.info("***CALL FAILED*** : cERC20 supplyRatePerBlock() reverted", []);
      market.borrowRate = zeroBD;
    } else {
      if (mantissaFactorBD.equals(zeroBD)) {
        market.borrowRate = zeroBD;
      } else {
        market.borrowRate = supplyRatePerBlock.value
          .toBigDecimal()
          .times(BigDecimal.fromString("2102400"))
          .div(mantissaFactorBD)
          .truncate(mantissaFactor);
      }
    }
    market.save();
  }
  return market as Market;
}
