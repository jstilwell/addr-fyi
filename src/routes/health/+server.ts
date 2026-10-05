import type { RequestHandler } from './$types';
import { text } from '#lib/server/respond.js';

export const GET: RequestHandler = () => text('ok\n');
