import type { RequestHandler } from './$types';
import { text } from '$lib/server/respond';

export const GET: RequestHandler = () => text('ok\n');
