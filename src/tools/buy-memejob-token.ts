import {
	BaseTool,
	type Context,
	PromptGenerator,
	type RawTransactionResponse,
	transactionToolOutputParser,
} from "@hashgraph/hedera-agent-kit";
import { type Client, Transaction } from "@hiero-ledger/sdk";
import type { z } from "zod";
import { createMemejob } from "../client";
import { buyMemejobTokenParameters } from "../memejob.zod";
import { handleResponse, handleTransaction, toTiny } from "../utils";

const buyMemejobTokenPrompt = (context: Context = {}) => {
	const contextSnippet = PromptGenerator.getContextSnippet(context);
	const usageInstructions = PromptGenerator.getParameterUsageInstructions();

	return `
${contextSnippet}

This tool buys a memecoin/meme token on memejob.

Parameters:
- required.tokenId (string, required): The id of the token to be bought.
- required.amount (number, required): The amount of the token to be bought.
- optional.autoAssociate (boolean, optional): Whether to associate the token or not before buying.
- optional.referrer (evm address, optional): The EVM address of the referrer (e.g. 0x000...000).
${usageInstructions}

IMPORTANT: When Mode is Return Bytes, always present the transaction bytes to the user.
`;
};

const buyMemejobTokenPostProcess = (response: RawTransactionResponse) =>
	`Memejob buy submitted. Status: ${response.status}. Transaction ID: ${response.transactionId}`;

type BuyMemejobTokenParams = z.infer<
	ReturnType<typeof buyMemejobTokenParameters>
>;

export const BUY_MEMEJOB_TOKEN_TOOL = "buy_memejob_token_tool";

/**
 * Tool that buys a memecoin token on the memejob platform.
 *
 * The tool follows the two-step `BaseTool` lifecycle:
 * - {@link BuyMemejobTokenTool.coreAction} asks the memejob SDK (always
 *   configured to return raw bytes) to build a `ContractExecuteTransaction`
 *   for the buy operation and reconstructs it via `Transaction.fromBytes`.
 * - {@link BuyMemejobTokenTool.secondaryAction} delegates to the local
 *   `handleTransaction` helper, which executes the transaction or returns
 *   bytes for external signing depending on `context.mode`.
 *
 * The token amount is automatically converted from decimal to tiny units using
 * the {@link toTiny} utility function.
 *
 * @example
 * ```typescript
 * const tool = new BuyMemejobTokenTool(context);
 * const result = await tool.execute(client, context, {
 *   required: {
 *     tokenId: '0.0.12345',
 *     amount: 100,
 *   },
 *   optional: {
 *     autoAssociate: true,
 *     referrer: '0x1234567890abcdef1234567890abcdef12345678',
 *   },
 * });
 * ```
 */
export class BuyMemejobTokenTool extends BaseTool<
	BuyMemejobTokenParams,
	BuyMemejobTokenParams
> {
	method = BUY_MEMEJOB_TOKEN_TOOL;
	name = "Buy Memejob Token";
	description: string;
	parameters: ReturnType<typeof buyMemejobTokenParameters>;
	override outputParser = transactionToolOutputParser;

	constructor(context: Context) {
		super();
		this.description = buyMemejobTokenPrompt(context);
		this.parameters = buyMemejobTokenParameters(context);
	}

	async normalizeParams(
		params: BuyMemejobTokenParams,
		_context: Context,
		_client: Client,
	): Promise<BuyMemejobTokenParams> {
		return params;
	}

	async coreAction(
		params: BuyMemejobTokenParams,
		_context: Context,
		client: Client,
	) {
		const { required, optional } = params;
		const { tokenId, amount } = required;
		const { autoAssociate = false, referrer } = optional || {};

		const memejob = createMemejob(client);
		const token = await memejob.getToken(tokenId as `0.0.${number}`);

		const bytes = (await token.buy({
			amount: BigInt(toTiny(amount)),
			autoAssociate: autoAssociate,
			referrer: referrer as `0x${string}`,
		})) as Uint8Array;

		return Transaction.fromBytes(bytes);
	}

	override async shouldSecondaryAction(
		coreActionResult: unknown,
		_context: Context,
	) {
		return coreActionResult instanceof Transaction;
	}

	async secondaryAction(
		transaction: Transaction,
		client: Client,
		context: Context,
	) {
		return handleTransaction(
			transaction,
			client,
			context,
			buyMemejobTokenPostProcess,
		);
	}

	async handleError(error: unknown, _context: Context) {
		console.error("[BuyMemejobToken] Error buying memejob token:", error);
		const message =
			error instanceof Error ? error.message : "Failed to buy memejob token";
		return handleResponse({ error: message }, message);
	}
}

const tool = (context: Context) => new BuyMemejobTokenTool(context);

export default tool;
