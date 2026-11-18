import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

const schema = a.schema({
  // Treningi: widoczne tylko dla właściciela
  Run: a
    .model({
      date: a.date().required(),
      distanceKm: a.float().required(),
      durationSec: a.integer().required(),
      note: a.string(),
      // Pola dla biegów nagranych przez GPS (dla ręcznych wpisów puste):
      route: a.string(), // trasa zapisana jako "encoded polyline" (kilka KB)
      splits: a.integer().array(), // czas każdego pełnego kilometra w sekundach
      startedAt: a.datetime(), // moment startu (ISO 8601)
      source: a.string(), // 'gps' | 'demo' (puste = wpis ręczny)
    })
    .authorization((allow) => [allow.owner()]),

  // Profil: id = userId (Cognito sub), widoczny tylko dla właściciela
  Profile: a
    .model({
      nickname: a.string().required(),
      monthlyGoalKm: a.float(),
      showInRanking: a.boolean(),
    })
    .authorization((allow) => [allow.owner()]),

  // Plan treningowy: id = userId (jeden aktywny plan na użytkownika), cały plan jako JSON
  TrainingPlan: a
    .model({
      startDate: a.date().required(),
      planJson: a.string().required(),
    })
    .authorization((allow) => [allow.owner()]),

  // Podsumowanie użytkownika dla administratora: id = userId.
  // Tylko dane zbiorcze (bez tras, notatek i pojedynczych treningów).
  // Zapisuje właściciel (aplikacja robi to sama), czytać mogą administratorzy z grupy Cognito "admin".
  UserStats: a
    .model({
      nickname: a.string().required(),
      totalKm: a.float().required(),
      runs: a.integer().required(),
      totalSec: a.integer().required(),
      bestPaceSec: a.float(),
      longestKm: a.float(),
      firstRun: a.date(),
      lastRun: a.date(),
      gpsRuns: a.integer(),
      monthsJson: a.string(), // {"2026-11":[km, biegi, sekundy], ...}
      hasPlan: a.boolean(),
    })
    .authorization((allow) => [allow.owner(), allow.group('admin').to(['read'])]),

  // Wynik miesięczny: id = `${userId}_${YYYY-MM}`.
  // Zapisuje właściciel, odczytują wszyscy zalogowani (ranking).
  MonthlyScore: a
    .model({
      month: a.string().required(),
      nickname: a.string().required(),
      totalKm: a.float().required(),
      runs: a.integer().required(),
      bestPaceSec: a.float(),
    })
    .authorization((allow) => [
      allow.owner(),
      allow.authenticated().to(['read']),
    ]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: { defaultAuthorizationMode: 'userPool' },
});
