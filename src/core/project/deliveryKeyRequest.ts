export type DeliveryKeyRequest = Readonly<{
  name: string;
  environments: ReadonlyArray<string>;
  hasPreviewDeliveryAccess: boolean;
  expiresAt: Date;
}>;

/** The key bootstrap creates: preview access to this one environment, valid for a year. */
export const planDeliveryKeyRequest = (envId: string, nowMs: number): DeliveryKeyRequest => {
  const expiresAt = new Date(nowMs);
  expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1);
  return {
    name: `Delivery key — CLI bootstrap (${new Date(nowMs).toISOString().slice(0, 10)})`,
    environments: [envId],
    hasPreviewDeliveryAccess: true,
    expiresAt,
  };
};
