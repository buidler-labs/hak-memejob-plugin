import {
	AgentMode,
	BaseTool,
	type Context,
	PromptGenerator,
} from "@hashgraph/hedera-agent-kit";
import type { Client } from "@hiero-ledger/sdk";
import type { z } from "zod";
import { createMemejob } from "../client";
import { createMemejobTokenParameters } from "../memejob.zod";
import { handleResponse, toTiny } from "../utils";

const createMemejobTokenPrompt = (context: Context = {}) => {
	const contextSnippet = PromptGenerator.getContextSnippet(context);
	const usageInstructions = PromptGenerator.getParameterUsageInstructions();

	return `
${contextSnippet}

This tool creates a memecoin/meme token on memejob.

Parameters:
- required.name (str, required): The name of the token.
- required.symbol (str, required): The symbol of the token.
- required.memo (str, required): The token metadata IPFS path.
- optional.amount (number, optional): The initial token amount to buy.
- optional.distributeRewards (boolean, optional): Whether to distribute rewards.
- optional.referrer (string, optional): The referrer EVM address.
${usageInstructions}

IMPORTANT: When Mode is Return Bytes, always present the transaction bytes to the user.
`;
};

type CreateMemejobTokenParams = z.infer<
	ReturnType<typeof createMemejobTokenParameters>
>;

export const CREATE_MEMEJOB_TOKEN_TOOL = "create_memejob_token_tool";

export class CreateMemejobTokenTool extends BaseTool<
	CreateMemejobTokenParams,
	CreateMemejobTokenParams
> {
	method = CREATE_MEMEJOB_TOKEN_TOOL;
	name = "Create Memejob Token";
	description: string;
	parameters: ReturnType<typeof createMemejobTokenParameters>;

	constructor(context: Context) {
		super();
		this.description = createMemejobTokenPrompt(context);
		this.parameters = createMemejobTokenParameters(context);
	}

	async normalizeParams(
		params: CreateMemejobTokenParams,
		_context: Context,
		_client: Client,
	): Promise<CreateMemejobTokenParams> {
		return params;
	}

	async coreAction(
		params: CreateMemejobTokenParams,
		context: Context,
		client: Client,
	) {
		const { required, optional } = params;
		const { name, symbol, memo } = required;
		const { amount = 0, distributeRewards = false, referrer } = optional || {};

		const memejob = createMemejob(client, context);
		const response = await memejob.createToken(
			{
				name,
				symbol,
				memo,
			},
			{
				amount: BigInt(toTiny(amount)),
				distributeRewards: distributeRewards,
				referrer: referrer,
			},
		);

		if (context.mode === AgentMode.AUTONOMOUS) {
			// biome-ignore lint/suspicious/noExplicitAny: MJToken isn't an exposed interface
			const tokenId = (response as any).tokenId.toString();

			return handleResponse(
				{
					tokenId,
				},
				`Your token has been successfully created. Token ID: ${tokenId}`,
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
		console.error("[CreateMemejobToken] Error creating memejob token:", error);
		const message =
			error instanceof Error ? error.message : "Failed to create memejob token";
		return handleResponse({ error: message }, message);
	}
}

const tool = (context: Context) => new CreateMemejobTokenTool(context);

export default tool;
