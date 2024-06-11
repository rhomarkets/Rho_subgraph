// For each division by 10, add one to exponent to truncate one significant figure
import { Address, BigDecimal, Bytes } from "@graphprotocol/graph-ts/index";
import { Account, AccountCToken } from "../generated/schema";

export const comptrollerAddress = "0x4960278F9584c988ff76213D05B9956eE4327E05"; //UNITROLLER
export const priceOracle = "0xa6fb4C9e62156B49c47791D3524dba60B067D5Aa";
export const daiAddress = "0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359"; 
export const rUSDCAddress = "0x142B5388575ffA6Ec84166ac70462fc9139b1c5f";
export const rETHAddress = "0xF873413AA072BFcdD97e81f74B190FFFB9110f42";
export const USDCAddress = "0x6c8dEcB3639a8B693BfB6cBdF0A9DE351F0419dC";

export function exponentToBigDecimal(decimals: i32): BigDecimal {
  let bd = BigDecimal.fromString("1");
  for (let i = 0; i < decimals; i++) {
    bd = bd.times(BigDecimal.fromString("10"));
  }
  return bd;
}

export let mantissaFactor = 18;
export let cTokenDecimals = 8;
export let mantissaFactorBD: BigDecimal = exponentToBigDecimal(18);
export let cTokenDecimalsBD: BigDecimal = exponentToBigDecimal(8);
export let zeroBD = BigDecimal.fromString("0");

export function createAccountCToken(
  cTokenStatsID: string,
  symbol: string,
  account: string,
  marketID: string
): AccountCToken {
  let cTokenStats = new AccountCToken(cTokenStatsID);
  cTokenStats.symbol = symbol;
  cTokenStats.market = marketID;
  cTokenStats.account = account;
  cTokenStats.transactionHashes = [];
  cTokenStats.transactionTimes = [];
  cTokenStats.accrualBlockNumber = 0;
  cTokenStats.cTokenBalance = zeroBD;
  cTokenStats.cTokenBalanceUSD = zeroBD;
  cTokenStats.totalUnderlyingSupplied = zeroBD;
  cTokenStats.totalUnderlyingSuppliedUSD = zeroBD;
  cTokenStats.totalUnderlyingRedeemed = zeroBD;
  cTokenStats.accountBorrowIndex = zeroBD;
  cTokenStats.totalUnderlyingBorrowed = zeroBD;
  cTokenStats.totalUnderlyingBorrowedUSD = zeroBD;
  cTokenStats.totalUnderlyingRepaid = zeroBD;
  cTokenStats.storedBorrowBalance = zeroBD;
  cTokenStats.storedBorrowBalanceUSD = zeroBD;
  cTokenStats.enteredMarket = false;
  return cTokenStats;
}

export function createAccount(accountID: string): Account {
  let account = new Account(accountID);
  account.countLiquidated = 0;
  account.countLiquidator = 0;
  account.hasBorrowed = false;
  account.totalBorrowValueInEth = zeroBD;
  account.totalCollateralValueInEth = zeroBD;
  account.liquitity = zeroBD;
  account.shortfall = zeroBD;
  account.save();
  return account;
}

export function updateCommonCTokenStats(
  marketID: string,
  marketSymbol: string,
  accountID: string,
  txHash: Bytes,
  timestamp: i32,
  blockNumber: i32
): AccountCToken {
  let cTokenStatsID = marketID.concat("-").concat(accountID);
  let cTokenStats = AccountCToken.load(cTokenStatsID);
  if (cTokenStats == null) {
    cTokenStats = createAccountCToken(
      cTokenStatsID,
      marketSymbol,
      accountID,
      marketID
    );
  }
  let txHashes = cTokenStats.transactionHashes;
  txHashes.push(txHash);
  cTokenStats.transactionHashes = txHashes;
  let txTimes = cTokenStats.transactionTimes;
  txTimes.push(timestamp);
  cTokenStats.transactionTimes = txTimes;
  cTokenStats.accrualBlockNumber = blockNumber;
  return cTokenStats as AccountCToken;
}
