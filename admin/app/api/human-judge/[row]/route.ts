import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { writeHumanJudgement } from '@/lib/sheets';

export const dynamic = 'force-dynamic';

/**
 * 人間の最終判断を保存する（要ログイン）。
 * body: { judge: '合格' | '不合格' | ''(取り消し) }
 * 採点者はログインユーザーのメール/名前。人間採点日時は自動で現在時刻。
 * AI採点列（合否 等）には触れない。
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ row: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { row } = await params;
  const rowNum = parseInt(row, 10);
  if (isNaN(rowNum)) {
    return NextResponse.json({ error: 'Invalid row' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { judge?: string };
  const judge = (body.judge ?? '').trim();
  const clear = judge === '';
  if (!clear && judge !== '合格' && judge !== '不合格') {
    return NextResponse.json({ error: 'judge は 合格 / 不合格 / 空（取り消し）' }, { status: 400 });
  }

  const grader = session.user?.name || session.user?.email || '不明';

  try {
    await writeHumanJudgement(rowNum, { humanJudge: judge, grader, clear });
    return NextResponse.json({ success: true, humanJudge: judge, grader, cleared: clear });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
