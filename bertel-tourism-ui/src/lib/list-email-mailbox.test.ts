/** @jest-environment node */
import nodemailer from 'nodemailer';
import { listEmailMailbox } from './list-email-mailbox';

describe('list email mailbox and the Nodemailer envelope', () => {
  const transport = nodemailer.createTransport({ streamTransport: true, buffer: true });

  it.each([
    ["O'Guest+tag@EXAMPLE.TEST", "O'Guest+tag@example.test"],
    ['Guest@bücher.test', 'Guest@xn--bcher-kva.test'],
    ['À.b+猫@BÜCHER.example', 'À.b+猫@xn--bcher-kva.example'],
    ['A\u0300@EXAMPLE.TEST', 'A\u0300@example.test'],
    ['👩‍💻@EXAMPLE.TEST', '👩‍💻@example.test'],
    ['Guest@ＢÜＣＨＥＲ。test', 'Guest@xn--bcher-kva.test'],
    ['Guest@test.ΟΣ', 'Guest@test.xn--0xag'],
    ['Guest@test.xn--0xag', 'Guest@test.xn--0xag'],
  ])('preserves a single canonical recipient for %s', async (input, canonical) => {
    expect(listEmailMailbox(input)).toBe(canonical);
    for (const to of [input, canonical]) {
      const { envelope } = await transport.sendMail({ from: 'fixture@example.test', to, text: 'Fixture' });
      expect(envelope.to).toHaveLength(1);
      expect(listEmailMailbox(envelope.to[0])).toBe(canonical);
    }
  });

  it.each(['<a@example.test>', 'Nom<a@example.test>', 'a@example.test(foo)', '"a"@example.test',
    'foo,a@example.test', 'a..b@example.test', 'a@example.test.', 'a@example.test/path', 'a@127.1',
    'a@0x7f.1', 'a@%65xample.test', 'a@example.test：443', 'a@\uD800.test', 'a\u2003b@example.test',
  ])('rejects ambiguous or invalid mailbox %s', (value) => {
    expect(listEmailMailbox(value)).toBeNull();
  });
});
