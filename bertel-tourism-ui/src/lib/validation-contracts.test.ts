/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('./env.server', () => ({ readSmtpConfig: jest.fn() }));
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from './zod';
import { loginEmailSchema } from './schemas/login';
import { objectGeneralSchema } from './schemas/object-general';
import { objectContactSchema } from './schemas/object-contact';
import { settingsThemeSchema } from './schemas/settings-theme';
import { smtpSettingsInputSchema } from './smtp-settings.server';
import { translationRequestSchema } from '../app/api/ai/translate/translation';
import { extractedMenuSchema } from '../app/api/menu/extract/extraction';
import { photoAssessmentSchema } from '../app/api/portal-photo/analyze/assessment';

const schemas = {
  login: loginEmailSchema, general: objectGeneralSchema, contact: objectContactSchema,
  theme: settingsThemeSchema, smtp: smtpSettingsInputSchema,
  translation: translationRequestSchema, menu: extractedMenuSchema, photo: photoAssessmentSchema,
};

// Golden contracts captured from the released parsers and master5f schemas.
// Only outcomes, parsed data, paths and user-facing messages are retained;
// the historical runtime is not a test or application dependency.
const cases: { schema: keyof typeof schemas; name: string; input: unknown; expected: unknown }[] = [
  { schema: "login", name: "valid", input: {"email":"tourism+tag@example.invalid","password":"synthetic-password"}, expected: {"success":true,"data":{"email":"tourism+tag@example.invalid","password":"synthetic-password"}} },
  { schema: "login", name: "missing", input: {}, expected: {"success":false,"issues":[{"path":["email"],"message":"Required"},{"path":["password"],"message":"Required"}]} },
  { schema: "login", name: "wrongTypes", input: {"email":2,"password":null}, expected: {"success":false,"issues":[{"path":["email"],"message":"Expected string, received number"},{"path":["password"],"message":"Expected string, received null"}]} },
  { schema: "login", name: "badEmail", input: {"email":"first..last@example.invalid","password":"synthetic-password"}, expected: {"success":false,"issues":[{"path":["email"],"message":"Email invalide"}]} },
  { schema: "login", name: "shortPassword", input: {"email":"tourism+tag@example.invalid","password":"short"}, expected: {"success":false,"issues":[{"path":["password"],"message":"Au moins 8 caracteres"}]} },
  { schema: "login", name: "emailUnderscore", input: {"email":"first_last@example.invalid","password":"synthetic-password"}, expected: {"success":true,"data":{"email":"first_last@example.invalid","password":"synthetic-password"}} },
  { schema: "login", name: "emailApostrophe", input: {"email":"o'connor@example.invalid","password":"synthetic-password"}, expected: {"success":true,"data":{"email":"o'connor@example.invalid","password":"synthetic-password"}} },
  { schema: "general", name: "valid", input: {"name":"Hotel","description":"","extra":"ignored"}, expected: {"success":true,"data":{"name":"Hotel","description":""}} },
  { schema: "general", name: "missing", input: {}, expected: {"success":false,"issues":[{"path":["name"],"message":"Required"}]} },
  { schema: "general", name: "empty", input: {"name":""}, expected: {"success":false,"issues":[{"path":["name"],"message":"Nom requis"}]} },
  { schema: "general", name: "wrongType", input: {"name":false}, expected: {"success":false,"issues":[{"path":["name"],"message":"Expected string, received boolean"}]} },
  { schema: "general", name: "nullDescription", input: {"name":"Hotel","description":null}, expected: {"success":false,"issues":[{"path":["description"],"message":"Expected string, received null"}]} },
  { schema: "contact", name: "valid", input: {"value":"123","kind":"phone"}, expected: {"success":true,"data":{"value":"123","kind":"phone"}} },
  { schema: "contact", name: "missing", input: {}, expected: {"success":false,"issues":[{"path":["value"],"message":"Required"}]} },
  { schema: "contact", name: "emptyValue", input: {"value":""}, expected: {"success":false,"issues":[{"path":["value"],"message":"Valeur requise"}]} },
  { schema: "contact", name: "emptyLabel", input: {"value":"123","label":""}, expected: {"success":false,"issues":[{"path":["label"],"message":"Libelle requis"}]} },
  { schema: "contact", name: "null", input: {"value":null}, expected: {"success":false,"issues":[{"path":["value"],"message":"Expected string, received null"}]} },
  { schema: "theme", name: "valid", input: {"brandName":"Bertel","primaryColor":"#0c7d75","logoUrl":""}, expected: {"success":true,"data":{"brandName":"Bertel","logoUrl":"","primaryColor":"#0c7d75"}} },
  { schema: "theme", name: "missing", input: {}, expected: {"success":false,"issues":[{"path":["brandName"],"message":"Required"}]} },
  { schema: "theme", name: "emptyBrand", input: {"brandName":""}, expected: {"success":false,"issues":[{"path":["brandName"],"message":"Nom de marque requis"}]} },
  { schema: "theme", name: "badColor", input: {"brandName":"Bertel","accentColor":"red"}, expected: {"success":false,"issues":[{"path":["accentColor"],"message":"Couleur hex"}]} },
  { schema: "theme", name: "emptyColor", input: {"brandName":"Bertel","textColor":""}, expected: {"success":false,"issues":[{"path":["textColor"],"message":"Couleur hex"}]} },
  { schema: "smtp", name: "valid", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":true,"data":{"enabled":true,"host":"smtp.example.invalid","port":587,"secure":false,"fromEmail":"sender@example.invalid","fromName":"Sender","authMode":"relay","user":""}} },
  { schema: "smtp", name: "passwordMode", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"password","user":"smtp-user"}, expected: {"success":true,"data":{"enabled":true,"host":"smtp.example.invalid","port":587,"secure":false,"fromEmail":"sender@example.invalid","fromName":"Sender","authMode":"password","user":"smtp-user"}} },
  { schema: "smtp", name: "missingUser", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"password","user":""}, expected: {"success":false,"issues":[{"path":["user"],"message":"Indiquez l’identifiant SMTP."}]} },
  { schema: "smtp", name: "badHost", input: {"enabled":true,"host":"https://smtp.example.invalid/","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["host"],"message":"Utilisez un nom de serveur, sans https:// ni chemin."}]} },
  { schema: "smtp", name: "badEmail", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":"bad","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["fromEmail"],"message":"Indiquez une adresse d’expédition valide."}]} },
  { schema: "smtp", name: "badPort", input: {"enabled":true,"host":" smtp.example.invalid ","port":0,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["port"],"message":"Number must be greater than or equal to 1"}]} },
  { schema: "smtp", name: "fractionPort", input: {"enabled":true,"host":" smtp.example.invalid ","port":1.5,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["port"],"message":"Expected integer, received float"}]} },
  { schema: "smtp", name: "fractionBelowMinimum", input: {"enabled":true,"host":" smtp.example.invalid ","port":0.5,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["port"],"message":"Expected integer, received float"},{"path":["port"],"message":"Number must be greater than or equal to 1"}]} },
  { schema: "smtp", name: "unsafeIntegerPort", input: {"enabled":true,"host":" smtp.example.invalid ","port":9007199254740992,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["port"],"message":"Number must be less than or equal to 65535"}]} },
  { schema: "smtp", name: "largeFinitePort", input: {"enabled":true,"host":" smtp.example.invalid ","port":1e+100,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["port"],"message":"Number must be less than or equal to 65535"}]} },
  { schema: "smtp", name: "badAuthMode", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"unknown","user":""}, expected: {"success":false,"issues":[{"path":["authMode"],"message":"Invalid enum value. Expected 'relay' | 'password', received 'unknown'"}]} },
  { schema: "smtp", name: "missingAuthMode", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","user":""}, expected: {"success":false,"issues":[{"path":["authMode"],"message":"Required"}]} },
  { schema: "smtp", name: "extra", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":" Sender ","authMode":"relay","user":"","unknown":"ignored"}, expected: {"success":false,"issues":[{"path":[],"message":"Unrecognized key(s) in object: 'unknown'"}]} },
  { schema: "smtp", name: "badLine", input: {"enabled":true,"host":" smtp.example.invalid ","port":587,"secure":false,"fromEmail":" sender@example.invalid ","fromName":"Injected\nHeader","authMode":"relay","user":""}, expected: {"success":false,"issues":[{"path":["fromName"],"message":"Valeur invalide."}]} },
  { schema: "translation", name: "valid", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"name":"Bonjour"}}, expected: {"success":true,"data":{"objectId":"HOTRUN0000000001","sourceLanguage":"fr","targetLanguage":"en","fields":{"name":"Bonjour"}}} },
  { schema: "translation", name: "sameLanguage", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"fr","fields":{"name":"Bonjour"}}, expected: {"success":false,"issues":[{"path":[],"message":"Invalid input"}]} },
  { schema: "translation", name: "emptyFields", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{}}, expected: {"success":false,"issues":[{"path":["fields"],"message":"Invalid input"}]} },
  { schema: "translation", name: "badKey", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"invalid key":"Bonjour"}}, expected: {"success":false,"issues":[{"path":["fields","invalid key"],"message":"Invalid"}]} },
  { schema: "translation", name: "constructorKey", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"constructor":"Bonjour"}}, expected: {"success":false,"issues":[{"path":["fields","constructor"],"message":"Invalid input"}]} },
  { schema: "translation", name: "wrongValue", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"name":123}}, expected: {"success":false,"issues":[{"path":["fields","name"],"message":"Expected string, received number"}]} },
  { schema: "translation", name: "tooLong", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"name":"x".repeat(30001)}}, expected: {"success":false,"issues":[{"path":["fields","name"],"message":"String must contain at most 30000 character(s)"},{"path":["fields"],"message":"Invalid input"}]} },
  { schema: "translation", name: "extra", input: {"objectId":"HOTRUN0000000001","sourceLanguage":"FR","targetLanguage":"EN","fields":{"name":"Bonjour"},"unknown":true}, expected: {"success":false,"issues":[{"path":[],"message":"Unrecognized key(s) in object: 'unknown'"}]} },
  { schema: "menu", name: "valid", input: {"title":"Menu","dishes":[{"name":"Plat","price":12,"section":"main"}]}, expected: {"success":true,"data":{"title":"Menu","dishes":[{"name":"Plat","price":12,"section":"main"}]}} },
  { schema: "menu", name: "defaults", input: {}, expected: {"success":true,"data":{"dishes":[]}} },
  { schema: "menu", name: "emptyDish", input: {"dishes":[{"name":""}]}, expected: {"success":false,"issues":[{"path":["dishes",0,"name"],"message":"String must contain at least 1 character(s)"}]} },
  { schema: "menu", name: "wrongPrice", input: {"dishes":[{"name":"Plat","price":false}]}, expected: {"success":false,"issues":[{"path":["dishes",0,"price"],"message":"Invalid input"}]} },
  { schema: "menu", name: "wrongDietary", input: {"dishes":[{"name":"Plat","dietary":"vegan"}]}, expected: {"success":false,"issues":[{"path":["dishes",0,"dietary"],"message":"Expected array, received string"}]} },
  { schema: "menu", name: "extra", input: {"title":"Menu","extra":true}, expected: {"success":true,"data":{"title":"Menu","dishes":[]}} },
  { schema: "photo", name: "valid", input: {"score":8,"summary":" Clear image ","strengths":[" Good light "],"issues":[]}, expected: {"success":true,"data":{"score":8,"summary":"Clear image","strengths":["Good light"],"issues":[]}} },
  { schema: "photo", name: "highScore", input: {"score":11,"summary":" Clear image ","strengths":[" Good light "],"issues":[]}, expected: {"success":false,"issues":[{"path":["score"],"message":"Number must be less than or equal to 10"}]} },
  { schema: "photo", name: "emptySummary", input: {"score":8,"summary":" ","strengths":[" Good light "],"issues":[]}, expected: {"success":false,"issues":[{"path":["summary"],"message":"String must contain at least 1 character(s)"}]} },
  { schema: "photo", name: "manyStrengths", input: {"score":8,"summary":" Clear image ","strengths":Array(6).fill("Light"),"issues":[]}, expected: {"success":false,"issues":[{"path":["strengths"],"message":"Array must contain at most 5 element(s)"}]} },
  { schema: "photo", name: "longText", input: {"score":8,"summary":"x".repeat(501),"strengths":[" Good light "],"issues":[]}, expected: {"success":false,"issues":[{"path":["summary"],"message":"String must contain at most 500 character(s)"}]} },
  { schema: "photo", name: "badIssueCode", input: {"score":8,"summary":" Clear image ","strengths":[" Good light "],"issues":[{"code":"unknown","explanation":"Clear","suggestion":"Retake"}]}, expected: {"success":false,"issues":[{"path":["issues",0,"code"],"message":"Invalid enum value. Expected 'blur' | 'exposure' | 'resolution' | 'framing' | 'obstruction' | 'text_overlay' | 'subject_unclear' | 'other_quality', received 'unknown'"}]} },
  { schema: "photo", name: "extra", input: {"score":8,"summary":" Clear image ","strengths":[" Good light "],"issues":[],"approved":true}, expected: {"success":false,"issues":[{"path":[],"message":"Unrecognized key(s) in object: 'approved'"}]} },
];

function contract(schema: z.ZodType, input: unknown) {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { success: true, data: parsed.data }
    : { success: false, issues: parsed.error.issues.map(({ path, message }) => ({ path, message })) };
}

it.each(cases)('$schema / $name keeps its validation contract', ({ schema, input, expected }) => {
  expect(contract(schemas[schema], input)).toEqual(expected);
});

it('keeps the actual login resolver values and visible field errors', async () => {
  const resolver = zodResolver(loginEmailSchema);
  const options = { fields: {}, shouldUseNativeValidation: false } as const;
  await expect(resolver({ email: 'member@example.invalid', password: 'synthetic-password' }, undefined, options))
    .resolves.toEqual({ errors: {}, values: { email: 'member@example.invalid', password: 'synthetic-password' } });
  const invalid = await resolver({ email: 'bad', password: 'short' }, undefined, options);
  expect(invalid.values).toEqual({});
  expect(invalid.errors.email?.message).toBe('Email invalide');
  expect(invalid.errors.password?.message).toBe('Au moins 8 caracteres');
});

it('keeps the actual theme resolver messages and optional color fields', async () => {
  const resolver = zodResolver(settingsThemeSchema);
  const options = { fields: {}, shouldUseNativeValidation: false } as const;
  await expect(resolver({ brandName: 'Bertel' }, undefined, options))
    .resolves.toEqual({ errors: {}, values: { brandName: 'Bertel' } });
  const invalid = await resolver({ brandName: '', primaryColor: 'red' }, undefined, options);
  expect(invalid.values).toEqual({});
  expect(invalid.errors.brandName?.message).toBe('Nom de marque requis');
  expect(invalid.errors.primaryColor?.message).toBe('Couleur hex (ex: #0c7d75)');
});
