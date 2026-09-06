import { NextResponse } from 'next/server';
import { getApplicantByRow, writeGradingResult, updateGradingStatus, updateApplicantFields } from '@/lib/sheets';
import { gradeApplicant } from '@/lib/grading';
import type { JobType } from '@/lib/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const VALID_JOB_TYPES: JobType[] = ['秘書', '海外営業', 'オンラインセールス', 'コールスタッフ'];

/**
 * フォーム送信時にGASから呼ばれる自動採点エンドポイント。
 * - 認証：ヘッダ x-auto-grade-secret === 環境変数 AUTO_GRADE_SECRET（セッション不要）
 * - 職種：フォームの「希望職種」を使う。未入力/想定外なら採点せずスキップ（手動採点に委ねる）
 * - 結果：既存の writeGradingResult でAI採点列（合否/採点ステータス/採点日時/採点結果JSON）に書き込む。
 *         人間の最終判断列（人間合否 等）には一切触れない。
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-auto-grade-secret');
  if (!process.env.AUTO_GRADE_SECRET || secret !== process.env.AUTO_GRADE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { row?: number | string };
  const rowNum = parseInt(String(body.row), 10);
  if (isNaN(rowNum)) {
    return NextResponse.json({ error: 'Invalid row' }, { status: 400 });
  }

  const applicant = await getApplicantByRow(rowNum);
  if (!applicant) {
    return NextResponse.json({ error: `行 ${rowNum} が見つかりません` }, { status: 404 });
  }

  // 希望職種（採点に使う職種）。有効なら「職種」列にも記録し、Slack報告など既存の職種表示に反映する。
  const desired = (applicant.desiredJobType || '').trim();
  const validJob = VALID_JOB_TYPES.includes(desired as JobType);
  if (validJob) {
    try {
      await updateApplicantFields(rowNum, { jobType: desired });
    } catch (e) {
      console.error('職種の記録に失敗:', e);
    }
  }

  // ゲート1：AIツール使用の共有URL/やりとりが提出されているか。
  // 2項目（共有リンク・ギガファイル便）が両方ともURLでない（空欄・「なし」・文字のみ）場合は、
  // AI採点を走らせず自動的に不合格にする。
  const hasUrl = (s: string) => /(https?:\/\/|www\.)\S+/i.test((s || '').trim());
  const aiUsed = hasUrl(applicant.aiLink) || hasUrl(applicant.aiLog);
  if (!aiUsed) {
    const rejectResult = {
      results: [],
      total_score: 0,
      overall_judgement: '不合格',
      overall_comment: 'AIツール使用の共有URL／やりとりが提出されていない（両項目ともURLなし）ため、自動不合格。AI採点は実施していません。',
    };
    await writeGradingResult(rowNum, rejectResult, undefined, '不合格');
    return NextResponse.json({
      success: true,
      judgement: '不合格',
      scored: false,
      reason: 'AI使用の共有URLなし → 採点せず自動不合格',
    });
  }

  // ゲート2：希望職種が未入力/想定外なら自動採点しない（手動に委ねる）
  if (!validJob) {
    return NextResponse.json({
      skipped: true,
      reason: `希望職種が未入力/想定外（"${desired}"）のため自動採点をスキップ。手動採点で対応してください。`,
    });
  }
  const jobType = desired as JobType;

  try {
    await updateGradingStatus(rowNum, '自動採点中');
  } catch (e) {
    console.error('updateGradingStatus error:', e);
  }

  try {
    const result = await gradeApplicant(applicant, jobType);
    // finalJudge に AI判定（合格/不合格）を書き込む＝AI採点層
    await writeGradingResult(rowNum, result, undefined, result.overall_judgement);
    return NextResponse.json({ success: true, jobType, judgement: result.overall_judgement });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('auto-grade error:', message);
    try {
      await writeGradingResult(rowNum, null, message);
    } catch (writeErr) {
      console.error('writeGradingResult error:', writeErr);
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
