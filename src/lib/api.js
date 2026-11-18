import { generateClient } from 'aws-amplify/data';
import { monthKey, pace } from './utils';

export const client = generateClient();

// pobiera wszystkie strony wyników (filtry DynamoDB działają po stronicowaniu)
export async function listAll(model, options = {}) {
  let items = [];
  let nextToken;
  do {
    const { data, errors, nextToken: next } = await model.list({ ...options, nextToken, limit: 1000 });
    if (errors) throw new Error(errors[0].message);
    items = items.concat(data);
    nextToken = next;
  } while (nextToken);
  return items;
}

// Aktualizuje (albo usuwa) wynik miesięczny użytkownika używany w rankingu.
// Wynik istnieje tylko wtedy, gdy użytkownik zgodził się na ranking i ma biegi w tym miesiącu.
export async function syncMonth(userId, profile, runs, month) {
  try {
    const id = `${userId}_${month}`;
    const monthRuns = runs.filter((r) => monthKey(r.date) === month);

    if (!profile?.showInRanking || monthRuns.length === 0) {
      await client.models.MonthlyScore.delete({ id });
      return;
    }

    const km = monthRuns.reduce((s, r) => s + r.distanceKm, 0);
    const best = Math.min(...monthRuns.map(pace));
    const payload = {
      id,
      month,
      nickname: profile.nickname,
      totalKm: Math.round(km * 100) / 100,
      runs: monthRuns.length,
      bestPaceSec: Math.round(best * 10) / 10,
    };

    const { data: existing } = await client.models.MonthlyScore.get({ id });
    if (existing) await client.models.MonthlyScore.update(payload);
    else await client.models.MonthlyScore.create(payload);
  } catch (e) {
    console.error('syncMonth', e);
  }
}

export async function syncAll(userId, profile, runs) {
  const months = new Set(runs.map((r) => monthKey(r.date)));
  for (const m of months) {
    await syncMonth(userId, profile, runs, m);
  }
}
