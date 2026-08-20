import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface PortfolioImageAttrs {
  companyId: Types.ObjectId;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  /** Display order on the public landing page — lower sorts first. */
  order: number;
  active: boolean;
}

export type PortfolioImageDocument = HydratedDocument<PortfolioImageAttrs>;

const portfolioImageSchema = new Schema<PortfolioImageAttrs>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    storageKey: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true, min: 1 },
    order: { type: Number, required: true, default: 0 },
    active: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);

portfolioImageSchema.index({ companyId: 1, order: 1 });
portfolioImageSchema.index({ storageKey: 1 }, { unique: true });

export const PortfolioImageModel: Model<PortfolioImageAttrs> = model<PortfolioImageAttrs>(
  'PortfolioImage',
  portfolioImageSchema,
);
