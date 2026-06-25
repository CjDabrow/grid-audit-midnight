// Network config for the deploy kit. Env-driven so the same code targets the local
// standalone network (undeployed) or a public network. setNetworkId must run before
// building wallets so addresses get the right HRP.
import { setNetworkId } from "@midnight-ntwrk/midnight-js/network-id";

export const NETWORK = process.env.MN_NETWORK ?? "undeployed";
setNetworkId(NETWORK);

export const CFG = {
  indexer: process.env.MN_INDEXER ?? "http://127.0.0.1:8088/api/v3/graphql",
  indexerWS: process.env.MN_INDEXER_WS ?? "ws://127.0.0.1:8088/api/v3/graphql/ws",
  node: process.env.MN_NODE ?? "http://127.0.0.1:9944",
  proofServer: process.env.MN_PROOF ?? "http://127.0.0.1:6300",
};
