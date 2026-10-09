import type { Tester } from '../types.ts';
import { axe } from './axe.ts';
import { eslint } from './eslint.ts';
import { gitleaks } from './gitleaks.ts';
import { lighthouse } from './lighthouse.ts';
import { osv } from './osv.ts';
import { playwright } from './playwright.ts';
import { review } from './review.ts';
import { semgrep } from './semgrep.ts';
import { testgen } from './testgen.ts';
import { tsc } from './tsc.ts';

/** Every tester runs in parallel on every run; each decides for itself whether it applies. */
export const TESTERS: readonly Tester[] = [eslint, tsc, semgrep, gitleaks, osv, playwright, lighthouse, axe, review, testgen];
