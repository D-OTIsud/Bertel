import { runInNewContext } from 'node:vm';
import { strictErrorMessage } from './strict-error-message';

describe('strictErrorMessage', () => {
  it('returns an Error message, including an empty message', () => {
    expect(strictErrorMessage(new Error('Échec précis'), 'Repli')).toBe('Échec précis');
    expect(strictErrorMessage(new Error(''), 'Repli')).toBe('');
  });

  it('keeps Error subclass and inherited message behavior', () => {
    class OperationError extends Error {}
    expect(strictErrorMessage(new OperationError('Sous-classe'), 'Repli')).toBe('Sous-classe');
    const inherited = Object.create(Error.prototype);
    expect(strictErrorMessage(inherited, 'Repli')).toBe('');
  });

  it('keeps a foreign-realm Error on the fallback branch', () => {
    const foreignError = runInNewContext('new Error("Foreign realm")');
    expect(foreignError instanceof Error).toBe(false);
    expect(strictErrorMessage(foreignError, 'Repli')).toBe('Repli');
  });

  it.each([null, undefined, 'message brut', 0, false, { message: 'Objet brut' }, Object.create(null)])(
    'uses the literal fallback for a non-Error value %j', (value) => {
      expect(strictErrorMessage(value, 'Repli')).toBe('Repli');
    },
  );

  it('does not read a plain object message getter', () => {
    const readMessage = jest.fn(() => { throw new Error('must not be read'); });
    const value = Object.defineProperty({}, 'message', { get: readMessage });
    expect(strictErrorMessage(value, 'Repli')).toBe('Repli');
    expect(readMessage).not.toHaveBeenCalled();
  });

  it('reads an Error message getter exactly once', () => {
    const readMessage = jest.fn(() => 'Lu une fois');
    const error = Object.defineProperty(new Error(), 'message', { get: readMessage });
    expect(strictErrorMessage(error, 'Repli')).toBe('Lu une fois');
    expect(readMessage).toHaveBeenCalledTimes(1);
  });

  it('does not replace a thrown Error message getter with the fallback', () => {
    const failure = new Error('getter failure');
    const error = Object.defineProperty(new Error(), 'message', { get: () => { throw failure; } });
    expect(() => strictErrorMessage(error, 'Repli')).toThrow(failure);
  });
});
