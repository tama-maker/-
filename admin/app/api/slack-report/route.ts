import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getApplicants } from '@/lib/sheets';

interface ReportApplicant {
  row: number;
  name: string;
  humanJudge: string;
  jobType: string;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return NextResponse.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });

  const { applicants }: { applicants: ReportApplicant[] } = await req.json();
  if (!applicants?.length) return NextResponse.json({ error: 'No applicants selected' }, { status: 400 });

  const baseUrl = process.env.NEXTAUTH_URL ?? '';

  // シートから最新状態を読み直す（一覧を更新していなくても正しい人間判定を報告する）
  const all = await getApplicants();
  const byRow = new Map(all.map((a) => [a.row, a]));

  const lines = applicants.map((a) => {
    const cur = byRow.get(a.row);
    const name = cur?.name || a.name;
    const jobType = cur?.jobType || a.jobType;
    const humanJudge = cur?.humanJudge || '';
    const judgeEmoji = humanJudge === '合格' ? '✅' : humanJudge === '不合格' ? '❌' : '⏸️';
    const url = `${baseUrl}/applicant/${a.row}`;
    return `${judgeEmoji} *${name}*（${jobType || '職種未設定'}）— ${humanJudge || '人間未判定'}\n   <${url}|詳細を見る>`;
  });

  const text = `📋 *採点結果報告*（${applicants.length}件）\n報告者: ${session.user?.email}\n\n${lines.join('\n\n')}`;

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Slack error: ${body}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
