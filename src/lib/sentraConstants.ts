export const SENTRA_PAID_CALL_PRICE_USDC = 0.1;
export const SENTRA_MIN_AGENT_STAKE_USDC = 100;

export function paidCallPriceLabel() {
  return `${SENTRA_PAID_CALL_PRICE_USDC.toFixed(1)} USDC`;
}

export function minAgentStakeLabel() {
  return `${SENTRA_MIN_AGENT_STAKE_USDC.toLocaleString()} USDC`;
}
