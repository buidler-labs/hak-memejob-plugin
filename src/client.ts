import {
	CONTRACT_DEPLOYMENTS,
	createAdapter,
	getChain,
	MJClient,
	NativeAdapter,
} from "@buidlerlabs/memejob-sdk-js";
import { type Client, ContractId } from "@hiero-ledger/sdk";

/**
 * Supported Memejob network types.
 */
type MemejobNetwork = "mainnet" | "testnet";

/**
 * Singleton instance of the Memejob client to avoid multiple initializations.
 */
let memejob: MJClient;

/**
 * Creates and configures a Memejob client instance for interacting with the memejob platform.
 *
 * @remarks
 * The client is always configured with the `returnBytes` operational mode. The
 * agent kit's `handleTransaction` strategy is responsible for deciding whether
 * to execute the transaction or return the bytes for external signing, based
 * on `context.mode`. Centralising that dispatch keeps the SDK responsible only
 * for building raw transactions.
 *
 * @returns A configured MJClient instance ready for any supported platform operations
 */
export const createMemejob = (client: Client) => {
	if (!memejob) {
		const network = client.ledgerId?.toString() as MemejobNetwork;

		memejob = new MJClient(
			createAdapter(NativeAdapter, {
				hederaClient: client,
				operationalMode: "returnBytes",
			}),
			{
				chain: getChain(network),
				contractId: ContractId.fromString(
					CONTRACT_DEPLOYMENTS[network].contractId,
				),
			},
		);
	}

	return memejob;
};
