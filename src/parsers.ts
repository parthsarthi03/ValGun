import Ajv, { ErrorObject, ValidateFunction } from 'ajv';

import {
  blockSchema,
  chainTipMessageSchema,
  errorMessageSchema,
  getBlockMessageSchema,
  iHaveBlockMessageSchema,
  putValidatedValueSchema
} from './schemas';

const ajv = new Ajv();
ajv.addFormat('id', /^[a-f0-9]{64}$/);

export function parser<T>(
  validate: ValidateFunction<T>
): (
  value: unknown
) => { value: T } | { value: undefined; errors: ErrorObject[] } {
  return (value) => {
    if (validate(value)) {
      return { value } as { value: T };
    } else {
      return { value: undefined, errors: validate.errors ?? [] };
    }
  };
}

export const parsePutValidatedValue = parser(
  ajv.compile(putValidatedValueSchema)
);
export const parseBlock = parser(ajv.compile(blockSchema));
export const parseErrorMessage = parser(ajv.compile(errorMessageSchema));
export const parseChainTipMessage = parser(ajv.compile(chainTipMessageSchema));
export const parseGetBlockMessage = parser(ajv.compile(getBlockMessageSchema));
export const parseIHaveBlockMessage = parser(
  ajv.compile(iHaveBlockMessageSchema)
);
