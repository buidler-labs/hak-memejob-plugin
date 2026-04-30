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
import { sellMemejobTokenParameters } from "../memejob.zod";
import { handleResponse, handleTransaction, toTiny } from "../utils";

const sellMemejobTokenPrompt = (context: Context = {}) => {
	const contextSnippet = PromptGenerator.getContextSnippet(context);
	const usageInstructions = PromptGenerator.getParameterUsageInstructions();

	return `
${contextSnippet}

This tool sells a memecoin/meme token on memejob.

Parameters:
- required.tokenId (string, required): The id of the token to be sold
- required.amount (number, required): The amount of the token to be sold
- optional.instant (boolean, optional): Whether to approve token allowance or not before selling
${usageInstructions}

IMPORTANT: When Mode is Return Bytes, always present the transaction bytes to the user.
`;
};

const sellMemejobTokenPostProcess = (response: RawTransactionResponse) =>
	`Memejob sell submitted. Status: ${response.status}. Transaction ID: ${response.transactionId}`;

type SellMemejobTokenParams = z.infer<
	ReturnType<typeof sellMemejobTokenParameters>
>;

export const SELL_MEMEJOB_TOKEN_TOOL = "sell_memejob_token_tool";

/**
 * Tool that sells a memecoin token on the memejob platform.
 *
 * The tool follows the two-step `BaseTool` lifecycle:
 * - {@link SellMemejobTokenTool.coreAction} asks the memejob SDK (always
 *   configured to return raw bytes) to build a `ContractExecuteTransaction`
 *   for the sell operation and reconstructs it via `Transaction.fromBytes`.
 * - {@link SellMemejobTokenTool.secondaryAction} delegates to the local
 *   `handleTransaction` helper, which executes the transaction or returns
 *   bytes for external signing depending on `context.mode`.
 *
 * The token amount is automatically converted from decimal to tiny units using
 * the {@link toTiny} utility function.
 *
 * @example
 * ```typescript
 * const tool = new SellMemejobTokenTool(context);
 * const result = await tool.execute(client, context, {
 *   required: {
 *     tokenId: '0.0.12345',
 *     amount: 50,
 *   },
 *   optional: {
 *     instant: true,
 *   },
 * });
 * ```
 */
export class SellMemejobTokenTool extends BaseTool<
	SellMemejobTokenParams,
	SellMemejobTokenParams
> {
	method = SELL_MEMEJOB_TOKEN_TOOL;
	name = "Sell Memejob Token";
	description: string;
	parameters: ReturnType<typeof sellMemejobTokenParameters>;
	override outputParser = transactionToolOutputParser;

	constructor(context: Context) {
		super();
		this.description = sellMemejobTokenPrompt(context);
		this.parameters = sellMemejobTokenParameters(context);
	}

	async normalizeParams(
		params: SellMemejobTokenParams,
		_context: Context,
		_client: Client,
	): Promise<SellMemejobTokenParams> {
		return params;
	}

	async coreAction(
		params: SellMemejobTokenParams,
		_context: Context,
		client: Client,
	) {
		const { required, optional } = params;
		const { tokenId, amount } = required;
		const { instant = true } = optional || {};

		const memejob = createMemejob(client);
		const token = await memejob.getToken(tokenId as `0.0.${number}`);

		const bytes = (await token.sell({
			amount: BigInt(toTiny(amount)),
			instant: instant,
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
			sellMemejobTokenPostProcess,
		);
	}

	async handleError(error: unknown, _context: Context) {
		console.error("[SellMemejobToken] Error selling memejob token:", error);
		const message =
			error instanceof Error ? error.message : "Failed to sell memejob token";
		return handleResponse({ error: message }, message);
	}
}

const tool = (context: Context) => new SellMemejobTokenTool(context);

export default tool;
