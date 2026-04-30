import {
	BaseTool,
	type Context,
	PromptGenerator,
	type RawTransactionResponse,
	transactionToolOutputParser,
} from "@hashgraph/hedera-agent-kit";
import {
	type Client,
	TokenId,
	Transaction,
	type TransactionId,
	type TransactionRecord,
} from "@hiero-ledger/sdk";
import type { z } from "zod";
import { createMemejob } from "../client";
import { createMemejobTokenParameters } from "../memejob.zod";
import { handleResponse, handleTransaction, toTiny } from "../utils";

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

const createMemejobTokenPostProcess = (response: RawTransactionResponse) => {
	const tokenId = response.tokenId?.toString();
	return tokenId
		? `Your token has been successfully created. Token ID: ${tokenId}. Transaction ID: ${response.transactionId}`
		: `Your token creation transaction was submitted but the Token ID could not be resolved. Transaction ID: ${response.transactionId}`;
};

type CreateMemejobTokenParams = z.infer<
	ReturnType<typeof createMemejobTokenParameters>
>;

export const CREATE_MEMEJOB_TOKEN_TOOL = "create_memejob_token_tool";

/**
 * Tool that creates a new memecoin token on the memejob platform.
 *
 * The tool follows the two-step `BaseTool` lifecycle:
 * - {@link CreateMemejobTokenTool.coreAction} asks the memejob SDK (always
 *   configured to return raw bytes) to build a `ContractExecuteTransaction`
 *   that calls the `memeJob` factory contract and reconstructs it via
 *   `Transaction.fromBytes`.
 * - {@link CreateMemejobTokenTool.secondaryAction} delegates to the local
 *   `handleTransaction` helper, which executes the transaction or returns
 *   bytes for external signing depending on `context.mode`. After execution
 *   it uses an `extendResponse` callback to resolve the auto-created HTS
 *   `tokenId` via the SDK's mirror-node lookup, since the token is created by
 *   the contract and is therefore not present on the receipt.
 *
 * @example
 * ```typescript
 * const tool = new CreateMemejobTokenTool(context);
 * const result = await tool.execute(client, context, {
 *   required: {
 *     name: 'My Awesome Token',
 *     symbol: 'MAT',
 *     memo: 'ipfs://Qm...',
 *   },
 *   optional: {
 *     amount: 1000,
 *     distributeRewards: true,
 *   },
 * });
 * ```
 */
export class CreateMemejobTokenTool extends BaseTool<
	CreateMemejobTokenParams,
	CreateMemejobTokenParams
> {
	method = CREATE_MEMEJOB_TOKEN_TOOL;
	name = "Create Memejob Token";
	description: string;
	parameters: ReturnType<typeof createMemejobTokenParameters>;
	override outputParser = transactionToolOutputParser;

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
		_context: Context,
		client: Client,
	) {
		const { required, optional } = params;
		const { name, symbol, memo } = required;
		const { amount = 0, distributeRewards = false, referrer } = optional || {};

		const memejob = createMemejob(client);
		const bytes = (await memejob.createToken(
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
		)) as Uint8Array;

		return Transaction.fromBytes(bytes);
	}

	override async shouldSecondaryAction(
		coreActionResult: unknown,
		_context: Context,
	) {
		return coreActionResult instanceof Transaction;
	}

	/**
	 * Resolves the auto-created HTS token ID by reusing the memejob SDK's
	 * mirror-node based lookup.
	 *
	 * The `memeJob` factory contract creates the HTS token internally, so
	 * neither the receipt nor the contract function result expose the token ID
	 * directly — it must be discovered by querying the mirror node for
	 * sibling transactions of type `TOKENCREATION`.
	 *
	 * `getTokenIdOnCreate` is `protected` on `MJAdapter`, so we cast through
	 * `unknown` to invoke it. At runtime the access modifier is a TypeScript
	 * construct only.
	 */
	private extendResponse = async (
		raw: RawTransactionResponse,
		record: TransactionRecord,
		client: Client,
	): Promise<RawTransactionResponse> => {
		const adapter = createMemejob(client).adapter as unknown as {
			getTokenIdOnCreate: (
				id: TransactionId | string,
			) => Promise<`0.0.${number}`>;
		};
		const tokenIdString = await adapter.getTokenIdOnCreate(record.transactionId);
		return { ...raw, tokenId: TokenId.fromString(tokenIdString) };
	};

	async secondaryAction(
		transaction: Transaction,
		client: Client,
		context: Context,
	) {
		return handleTransaction(
			transaction,
			client,
			context,
			createMemejobTokenPostProcess,
			(raw, record) => this.extendResponse(raw, record, client),
		);
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
