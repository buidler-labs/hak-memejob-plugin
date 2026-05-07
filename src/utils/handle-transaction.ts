import {
	AgentMode,
	type Context,
	type RawTransactionResponse,
} from "@hashgraph/hedera-agent-kit";
import {
	type Client,
	type Transaction,
	TransactionId,
	type TransactionRecord,
} from "@hiero-ledger/sdk";

/**
 * Strategy interface for executing a transaction depending on the active
 * {@link AgentMode}. Implementations either submit the transaction to the
 * network or freeze it and return raw bytes for external signing.
 */
interface TxModeStrategy {
	handle<T extends Transaction>(
		tx: T,
		client: Client,
		context: Context,
		postProcess?: (response: RawTransactionResponse) => unknown,
		extendResponse?: (
			raw: RawTransactionResponse,
			record: TransactionRecord,
		) => RawTransactionResponse | Promise<RawTransactionResponse>,
	): Promise<unknown>;
}

/**
 * Submits the transaction with the configured operator and returns a
 * `{ raw, humanMessage }` envelope. When `extendResponse` is provided, the
 * full {@link TransactionRecord} is fetched so callers can enrich the
 * response with data not present in the receipt (e.g. token IDs created via
 * a contract call rather than a native HTS transaction).
 */
class ExecuteStrategy implements TxModeStrategy {
	defaultPostProcess(response: RawTransactionResponse): string {
		return JSON.stringify(response, null, 2);
	}

	async handle(
		tx: Transaction,
		client: Client,
		_context: Context,
		postProcess: (
			response: RawTransactionResponse,
		) => string = this.defaultPostProcess,
		extendResponse?: (
			raw: RawTransactionResponse,
			record: TransactionRecord,
		) => RawTransactionResponse | Promise<RawTransactionResponse>,
	) {
		const submit = await tx.execute(client);
		const receipt = await submit.getReceipt(client);

		let raw: RawTransactionResponse = {
			status: receipt.status.toString(),
			accountId: receipt.accountId || null,
			tokenId: receipt.tokenId || null,
			transactionId: tx.transactionId?.toString() ?? "",
			topicId: receipt.topicId || null,
			scheduleId: receipt.scheduleId || null,
		};

		if (extendResponse) {
			const record = await submit.getRecord(client);
			raw = await extendResponse(raw, record);
		}

		return {
			raw,
			humanMessage: postProcess(raw),
		};
	}
}

/**
 * Freezes the transaction with the user's account ID and returns the
 * serialized bytes for external signing. Skips re-freezing if the upstream
 * builder already produced a frozen transaction.
 */
class ReturnBytesStrategy implements TxModeStrategy {
	async handle(tx: Transaction, client: Client, context: Context) {
		if (!context.accountId) {
			throw new Error(
				"Account ID is required in context for RETURN_BYTES mode",
			);
		}

		if (!tx.isFrozen()) {
			const id = TransactionId.generate(context.accountId);
			tx.setTransactionId(id).freezeWith(client);
		}

		return {
			raw: { bytes: tx.toBytes() },
			humanMessage: "Transaction ready for signing.",
		};
	}
}

const getStrategyFromContext = (context: Context): TxModeStrategy => {
	if (context.mode === AgentMode.RETURN_BYTES) {
		return new ReturnBytesStrategy();
	}
	return new ExecuteStrategy();
};

/**
 * Dispatches transaction handling to the strategy matching `context.mode`.
 * In autonomous mode the transaction is executed and an enriched response is
 * returned; in return-bytes mode the frozen serialized bytes are returned for
 * external signing.
 *
 * @param tx The transaction to be executed or serialized.
 * @param client A configured Hedera client.
 * @param context Agent kit context — `mode` selects the strategy.
 * @param postProcess Optional formatter for the human-readable message.
 * @param extendResponse Optional enricher that extracts extra data from the
 *   {@link TransactionRecord} (e.g. token IDs created via a contract call).
 */
export const handleTransaction = async (
	tx: Transaction,
	client: Client,
	context: Context,
	postProcess?: (response: RawTransactionResponse) => string,
	extendResponse?: (
		raw: RawTransactionResponse,
		record: TransactionRecord,
	) => RawTransactionResponse | Promise<RawTransactionResponse>,
) => {
	const strategy = getStrategyFromContext(context);
	return strategy.handle(tx, client, context, postProcess, extendResponse);
};
