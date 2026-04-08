import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from 'crypto';
import { LeaveType } from '../enums';

export function generateIdempotencyKey(
  employeeId: string,
  startDate: string,
  endDate: string,
  leaveType: LeaveType,
): string {
  return createHash('sha256')
    .update(`${employeeId}:${startDate}:${endDate}:${leaveType}`)
    .digest('hex');
}

export function verifyHmacSignature(
  payload: string,
  signature: string,
  secret: string,
): boolean {
  const expected = createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

export function computeHmacSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}
