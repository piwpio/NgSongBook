import { ChordNotation, detectNotation, formatChord, parseChord, parseNotation } from './chord';

/** Reads a chord in one notation and writes it back out in the other. */
function translate(token: string, from: ChordNotation, to: ChordNotation): string {
  return formatChord(parseChord(token, from), to);
}

describe('chord notation', () => {
  describe('the letter B, which is where the two disagree', () => {
    it('English B is Polish H', () => {
      expect(translate('B', 'en', 'pl')).toBe('H');
      expect(translate('H', 'pl', 'en')).toBe('B');
    });

    it('English Bb is Polish B', () => {
      expect(translate('Bb', 'en', 'pl')).toBe('B');
      expect(translate('B', 'pl', 'en')).toBe('Bb');
    });

    it('keeps the minor forms apart too', () => {
      expect(translate('Bm', 'en', 'pl')).toBe('h');
      expect(translate('Bbm', 'en', 'pl')).toBe('b');
      expect(translate('h', 'pl', 'en')).toBe('Bm');
      expect(translate('b', 'pl', 'en')).toBe('Bbm');
    });
  });

  describe('sharps and flats', () => {
    const sharps: [string, string][] = [
      ['C#', 'Cis'],
      ['D#', 'Dis'],
      ['E#', 'Eis'],
      ['F#', 'Fis'],
      ['G#', 'Gis'],
      ['A#', 'Ais'],
      ['B#', 'His'],
    ];

    const flats: [string, string][] = [
      ['Cb', 'Ces'],
      ['Db', 'Des'],
      ['Eb', 'Es'],
      ['Fb', 'Fes'],
      ['Gb', 'Ges'],
      ['Ab', 'As'],
      ['Bb', 'B'],
    ];

    it.each(sharps)('%s is %s', (english, polish) => {
      expect(translate(english, 'en', 'pl')).toBe(polish);
      expect(translate(polish, 'pl', 'en')).toBe(english);
    });

    it.each(flats)('%s is %s', (english, polish) => {
      expect(translate(english, 'en', 'pl')).toBe(polish);
      expect(translate(polish, 'pl', 'en')).toBe(english);
    });

    it('keeps the spelling it was given rather than picking an enharmonic', () => {
      expect(translate('C#', 'en', 'pl')).toBe('Cis');
      expect(translate('Db', 'en', 'pl')).toBe('Des');
    });
  });

  describe('minor', () => {
    it('English writes an m, Polish writes the root in lower case', () => {
      expect(translate('Am', 'en', 'pl')).toBe('a');
      expect(translate('C#m', 'en', 'pl')).toBe('cis');
      expect(translate('Ebm', 'en', 'pl')).toBe('es');
      expect(translate('a', 'pl', 'en')).toBe('Am');
      expect(translate('cis', 'pl', 'en')).toBe('C#m');
    });

    it('does not mistake maj for minor', () => {
      expect(translate('Cmaj7', 'en', 'pl')).toBe('Cmaj7');
      expect(translate('Amaj7', 'en', 'pl')).toBe('Amaj7');
    });
  });

  describe('everything after the root travels untouched', () => {
    const suffixes = ['7', 'sus4', 'sus2', 'dim', 'dim7', 'aug', 'add9', '6', '9', '11', '13', 'maj7'];

    it.each(suffixes)('keeps %s', suffix => {
      expect(translate(`C${suffix}`, 'en', 'pl')).toBe(`C${suffix}`);
      expect(translate(`B${suffix}`, 'en', 'pl')).toBe(`H${suffix}`);
    });

    it('carries the suffix across a minor chord', () => {
      expect(translate('C#m7', 'en', 'pl')).toBe('cis7');
      expect(translate('cis7', 'pl', 'en')).toBe('C#m7');
    });

    it('translates the bass note after a slash as well', () => {
      expect(translate('C/B', 'en', 'pl')).toBe('C/H');
      expect(translate('Am7/G', 'en', 'pl')).toBe('a7/G');
      expect(translate('C/H', 'pl', 'en')).toBe('C/B');
    });
  });

  describe('the sus trap', () => {
    it('reads asus4 as a minor with a sus4, not as A flat', () => {
      expect(translate('asus4', 'pl', 'en')).toBe('Amsus4');
      expect(translate('esus4', 'pl', 'en')).toBe('Emsus4');
    });

    it('still reads as and es as flats on their own', () => {
      expect(translate('as', 'pl', 'en')).toBe('Abm');
      expect(translate('Es', 'pl', 'en')).toBe('Eb');
    });
  });

  it('prints a token it cannot read exactly as it was written', () => {
    const chord = parseChord('N.C.', 'en');
    expect(chord.known).toBe(false);
    expect(formatChord(chord, 'pl')).toBe('N.C.');
  });
});

describe('detectNotation', () => {
  it('calls a song with an m-minor English', () => {
    expect(detectNotation(['E', 'B', 'C#m', 'G#m', 'A'])).toBe('en');
  });

  it('calls a song with lower-case roots Polish', () => {
    expect(detectNotation(['d', 'A', 'g', 'F'])).toBe('pl');
  });

  it('reads H and the is/es spellings as Polish', () => {
    expect(detectNotation(['H', 'E', 'A'])).toBe('pl');
    expect(detectNotation(['Cis', 'Fis'])).toBe('pl');
  });

  it('reads a flat written with b as English', () => {
    expect(detectNotation(['Bb', 'Eb', 'F'])).toBe('en');
  });

  it('gives up when the chords work in either notation', () => {
    expect(detectNotation(['C', 'F', 'G'])).toBeNull();
    expect(detectNotation([])).toBeNull();
  });
});

describe('parseNotation', () => {
  it('accepts the spellings a person might type', () => {
    expect(parseNotation('pl')).toBe('pl');
    expect(parseNotation('Polish')).toBe('pl');
    expect(parseNotation('de')).toBe('pl');
    expect(parseNotation('en')).toBe('en');
    expect(parseNotation('american')).toBe('en');
  });

  it('returns null for anything else, so the caller can complain', () => {
    expect(parseNotation('klingon')).toBeNull();
    expect(parseNotation(undefined)).toBeNull();
  });
});
