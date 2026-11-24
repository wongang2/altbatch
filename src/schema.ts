import { Schema } from 'firebase/ai';

/** Plain JSON Schema for the on-device `responseConstraint`. */
export const jsonSchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['photo', 'chart', 'decorative'] },
    alt: { type: 'string' },
    longDescription: { type: 'string' },
  },
  required: ['kind', 'alt'],
  additionalProperties: false,
} as const;

/** The same shape as a Firebase AI Logic `Schema` for the cloud `responseSchema`. */
export const responseSchema = Schema.object({
  properties: {
    kind: Schema.enumString({ enum: ['photo', 'chart', 'decorative'] }),
    alt: Schema.string(),
    longDescription: Schema.string(),
  },
  optionalProperties: ['longDescription'],
});

export const DEVICE_PROMPT =
  'You write alt text for a web page image. Decide kind: "photo" (a picture of a scene, object or person), ' +
  '"chart" (a chart, graph, diagram or screenshot of data), or "decorative" (pure decoration, no information). ' +
  'Write alt in English as one plain sentence under 125 characters. Do not start with "image of". ' +
  'For decorative images use an empty alt.';

export const CLOUD_PROMPT =
  DEVICE_PROMPT +
  ' For a chart, also fill longDescription with the chart type, axes, and the main values or trend in 2 to 4 sentences.';
