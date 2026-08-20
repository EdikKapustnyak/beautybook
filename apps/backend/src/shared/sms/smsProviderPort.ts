export interface SendSmsResult {
  providerMessageId: string;
}

/**
 * Abstraction over the SMS provider (technical-spec.md §11, §21
 * "Provider abstraction"). Kept intentionally minimal — just enough to
 * send a message and get back a provider-assigned id for tracking.
 */
export interface SmsProviderPort {
  sendSms(to: string, body: string): Promise<SendSmsResult>;
}
