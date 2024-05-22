import {
  AccrueInterest as AccrueInterestEvent,
  Approval as ApprovalEvent,
  Borrow as BorrowEvent,
  Failure as FailureEvent,
  LiquidateBorrow as LiquidateBorrowEvent,
  Mint as MintEvent,
  NewAdmin as NewAdminEvent,
  NewComptroller as NewComptrollerEvent,
  NewMarketInterestRateModel as NewMarketInterestRateModelEvent,
  NewPendingAdmin as NewPendingAdminEvent,
  NewProtocolSeizeShare as NewProtocolSeizeShareEvent,
  NewRedemptionReserveFactor as NewRedemptionReserveFactorEvent,
  NewReserveFactor as NewReserveFactorEvent,
  Redeem as RedeemEvent,
  RepayBorrow as RepayBorrowEvent,
  ReservesAdded as ReservesAddedEvent,
  ReservesReduced as ReservesReducedEvent,
  Transfer as TransferEvent
} from "../generated/rSTONE/rSTONE"
import {
  AccrueInterest,
  Approval,
  Borrow,
  Failure,
  LiquidateBorrow,
  Mint,
  NewAdmin,
  NewComptroller,
  NewMarketInterestRateModel,
  NewPendingAdmin,
  NewProtocolSeizeShare,
  NewRedemptionReserveFactor,
  NewReserveFactor,
  Redeem,
  RepayBorrow,
  ReservesAdded,
  ReservesReduced,
  Transfer
} from "../generated/schema"

export function handleAccrueInterest(event: AccrueInterestEvent): void {
  let entity = new AccrueInterest(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.cashPrior = event.params.cashPrior
  entity.interestAccumulated = event.params.interestAccumulated
  entity.borrowIndex = event.params.borrowIndex
  entity.totalBorrows = event.params.totalBorrows

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleApproval(event: ApprovalEvent): void {
  let entity = new Approval(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBorrow(event: BorrowEvent): void {
  let entity = new Borrow(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.borrower = event.params.borrower
  entity.borrowAmount = event.params.borrowAmount
  entity.accountBorrows = event.params.accountBorrows
  entity.totalBorrows = event.params.totalBorrows

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleFailure(event: FailureEvent): void {
  let entity = new Failure(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.error = event.params.error
  entity.info = event.params.info
  entity.detail = event.params.detail

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleLiquidateBorrow(event: LiquidateBorrowEvent): void {
  let entity = new LiquidateBorrow(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.liquidator = event.params.liquidator
  entity.borrower = event.params.borrower
  entity.repayAmount = event.params.repayAmount
  entity.rTokenCollateral = event.params.rTokenCollateral
  entity.seizeTokens = event.params.seizeTokens

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleMint(event: MintEvent): void {
  let entity = new Mint(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.minter = event.params.minter
  entity.mintAmount = event.params.mintAmount
  entity.mintTokens = event.params.mintTokens

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewAdmin(event: NewAdminEvent): void {
  let entity = new NewAdmin(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldAdmin = event.params.oldAdmin
  entity.newAdmin = event.params.newAdmin

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewComptroller(event: NewComptrollerEvent): void {
  let entity = new NewComptroller(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldComptroller = event.params.oldComptroller
  entity.newComptroller = event.params.newComptroller

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewMarketInterestRateModel(
  event: NewMarketInterestRateModelEvent
): void {
  let entity = new NewMarketInterestRateModel(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldInterestRateModel = event.params.oldInterestRateModel
  entity.newInterestRateModel = event.params.newInterestRateModel

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewPendingAdmin(event: NewPendingAdminEvent): void {
  let entity = new NewPendingAdmin(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldPendingAdmin = event.params.oldPendingAdmin
  entity.newPendingAdmin = event.params.newPendingAdmin

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewProtocolSeizeShare(
  event: NewProtocolSeizeShareEvent
): void {
  let entity = new NewProtocolSeizeShare(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldProtocolSeizeShareMantissa =
    event.params.oldProtocolSeizeShareMantissa
  entity.newProtocolSeizeShareMantissa =
    event.params.newProtocolSeizeShareMantissa

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewRedemptionReserveFactor(
  event: NewRedemptionReserveFactorEvent
): void {
  let entity = new NewRedemptionReserveFactor(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldRedemptionReserveFactor = event.params.oldRedemptionReserveFactor
  entity.newRedemptionReserveFactor = event.params.newRedemptionReserveFactor

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleNewReserveFactor(event: NewReserveFactorEvent): void {
  let entity = new NewReserveFactor(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.oldReserveFactorMantissa = event.params.oldReserveFactorMantissa
  entity.newReserveFactorMantissa = event.params.newReserveFactorMantissa

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRedeem(event: RedeemEvent): void {
  let entity = new Redeem(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.redeemer = event.params.redeemer
  entity.redeemAmount = event.params.redeemAmount
  entity.redeemTokens = event.params.redeemTokens

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleRepayBorrow(event: RepayBorrowEvent): void {
  let entity = new RepayBorrow(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.payer = event.params.payer
  entity.borrower = event.params.borrower
  entity.repayAmount = event.params.repayAmount
  entity.accountBorrows = event.params.accountBorrows
  entity.totalBorrows = event.params.totalBorrows

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleReservesAdded(event: ReservesAddedEvent): void {
  let entity = new ReservesAdded(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.benefactor = event.params.benefactor
  entity.addAmount = event.params.addAmount
  entity.newTotalReserves = event.params.newTotalReserves

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleReservesReduced(event: ReservesReducedEvent): void {
  let entity = new ReservesReduced(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.admin = event.params.admin
  entity.reduceAmount = event.params.reduceAmount
  entity.newTotalReserves = event.params.newTotalReserves

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTransfer(event: TransferEvent): void {
  let entity = new Transfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.from = event.params.from
  entity.to = event.params.to
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
