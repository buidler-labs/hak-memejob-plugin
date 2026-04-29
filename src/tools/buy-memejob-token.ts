import type { MJBuyResult } from "@buidlerlabs/memejob-sdk-js";
import {
	AgentMode,
	BaseTool,
	type Context,
	PromptGenerator,
} from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import type { z } from "zod";
import { createMemejob } from "../client";
import { buyMemejobTokenParameters } from "../memejob.zod";
import { handleResponse, toTiny } from "../utils";

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

type BuyMemejobTokenParams = z.infer<
	ReturnType<typeof buyMemejobTokenParameters>
>;

export const BUY_MEMEJOB_TOKEN_TOOL = "buy_memejob_token_tool";

export class BuyMemejobTokenTool extends BaseTool<
	BuyMemejobTokenParams,
	BuyMemejobTokenParams
> {
	method = BUY_MEMEJOB_TOKEN_TOOL;
	name = "Buy Memejob Token";
	description: string;
	parameters: ReturnType<typeof buyMemejobTokenParameters>;

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
		context: Context,
		client: Client,
	) {
		const { required, optional } = params;
		const { tokenId, amount } = required;
		const { autoAssociate = false, referrer } = optional || {};

		const memejob = createMemejob(client, context);
		const token = await memejob.getToken(tokenId as `0.0.${number}`);

		const response = await token.buy({
			amount: BigInt(toTiny(amount)),
			autoAssociate: autoAssociate,
			referrer: referrer as `0x${string}`,
		});

		if (context.mode === AgentMode.AUTONOMOUS) {
			const buyResult = response as MJBuyResult;
			const serializableAmount = Number(buyResult.amount);

			return handleResponse(
				{
					...buyResult,
					amount: serializableAmount,
				},
				buyResult.status === "success"
					? `Successfully bought ${serializableAmount} of ${tokenId}. Transaction ID: ${buyResult.transactionIdOrHash}`
					: `Failed to buy ${tokenId}. Transaction ID: ${buyResult.transactionIdOrHash}`,
			);
		}

		const bytes = Buffer.from(response as Uint8Array<ArrayBufferLike>);

		return handleResponse(
			{
				bytes,
			},
			`Your transaction has been prepared and it's ready to be signed. Hex encoded bytes: ${bytes.toString(
				"hex",
			)}`,
		);
	}

	async shouldSecondaryAction(_coreActionResult: unknown, _context: Context) {
		return false;
	}

	async secondaryAction(_request: unknown, _client: Client, _context: Context) {
		return null;
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
