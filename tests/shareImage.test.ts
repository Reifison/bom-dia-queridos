import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { composeShareImage } from '../src/lib/shareImage';
import { wrapBalancedText } from '../src/lib/messageArtLayout';

type ImageTone = 'night' | 'day' | 'mid-calm' | 'bright-main-dark-footer' | 'unreadable' | 'blank';

interface BrowserFixtureOptions {
  fontsAvailable?: boolean;
  imageTone?: ImageTone;
}

interface TextDraw {
  text: string;
  x: number;
  y: number;
  font: string;
  textAlign: string;
  fillStyle: string;
  width: number;
}

interface GradientStop {
  offset: number;
  color: string;
}

interface GradientFill {
  x: number;
  y: number;
  width: number;
  height: number;
  gradient: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    stops: GradientStop[];
  };
}

function browserFixture(t: TestContext, page: string, options: BrowserFixtureOptions = {}) {
  const images: FakeImage[] = [];
  const textDraws: TextDraw[] = [];
  const requestedFonts: string[] = [];
  const sampledCenters: number[] = [];
  const drawImages: unknown[][] = [];
  const gradientFills: GradientFill[] = [];
  const strokedText: string[] = [];
  const strokeStyles: string[] = [];
  let canvasElement: { width: number; height: number; getContext(): Record<string, any>; toBlob(callback: (blob: Blob) => void, type?: string): void };
  const context: Record<string, any> = {
    font: '16px Arial',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetY: 0,
    drawImage(...args: unknown[]) { drawImages.push(args); },
    fillRect(x: number, y: number, width: number, height: number) {
      if (typeof context.fillStyle !== 'string') {
        gradientFills.push({ x, y, width, height, gradient: context.fillStyle });
      }
    },
    createLinearGradient(x0: number, y0: number, x1: number, y1: number) {
      const gradient = {
        x0,
        y0,
        x1,
        y1,
        stops: [] as GradientStop[],
        addColorStop(offset: number, color: string) { gradient.stops.push({ offset, color }); },
      };
      return gradient;
    },
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arcTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    strokeText(text: string) {
      strokedText.push(text);
      strokeStyles.push(String(context.strokeStyle));
    },
    fillText(text: string, x: number, y: number) {
      const fontSize = Number(context.font.match(/([\d.]+)px/)?.[1] ?? 16);
      textDraws.push({
        text,
        x,
        y,
        font: context.font,
        textAlign: context.textAlign,
        fillStyle: String(context.fillStyle),
        width: [...text].length * fontSize * 0.51,
      });
    },
    measureText(text: string) {
      const fontSize = Number(context.font.match(/([\d.]+)px/)?.[1] ?? 16);
      return { width: [...text].length * fontSize * 0.51 };
    },
    getImageData(x: number, y: number, width: number, height: number) {
      if (options.imageTone === 'unreadable') throw new Error('Canvas is not readable');
      const center = (y + height / 2) / canvasElement.height;
      sampledCenters.push(center);
      const pixels = new Uint8ClampedArray(48 * 4);
      const levelFor = (index: number) => {
        if (options.imageTone === 'blank') return 255;
        if (options.imageTone === 'mid-calm') {
          if (center > 0.40 && center < 0.60) return 126;
          return index % 2 === 0 ? 0 : 245;
        }
        if (options.imageTone === 'bright-main-dark-footer') return center > 0.82 ? 18 : 232;
        return options.imageTone === 'day' ? 232 : 20;
      };
      for (let index = 0; index < pixels.length / 4; index += 1) {
        const level = levelFor(index);
        pixels[index * 4] = level;
        pixels[index * 4 + 1] = level;
        pixels[index * 4 + 2] = level;
        pixels[index * 4 + 3] = 255;
      }
      return { data: pixels };
    },
  };
  canvasElement = {
    getContext() { return context; },
    toBlob(callback: (blob: Blob) => void, type = 'image/jpeg') {
      callback(new Blob(['image'], { type }));
    },
    width: 0,
    height: 0,
  };

  class FakeImage {
    naturalWidth = 960;
    naturalHeight = 1200;
    crossOrigin: string | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';
    constructor() { images.push(this); }
  }

  const documentValue: Record<string, unknown> = { createElement: () => canvasElement };
  if (options.fontsAvailable) {
    documentValue.fonts = {
      load: async (font: string) => {
        requestedFonts.push(font);
        return [{ family: font }];
      },
    };
  }

  for (const [key, value] of Object.entries({
    Image: FakeImage,
    window: { location: { href: page } },
    document: documentValue,
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  return {
    images,
    textDraws,
    requestedFonts,
    sampledCenters,
    drawImages,
    canvas: canvasElement,
    gradientFills,
    strokedText,
    strokeStyles,
    context,
  };
}

function renderFromUrl(
  fixture: ReturnType<typeof browserFixture>,
  options: Parameters<typeof composeShareImage>[0],
) {
  const result = composeShareImage(options);
  if (typeof options.background === 'string') {
    assert.equal(fixture.images.length, 1);
    fixture.images[0].onload!();
  }
  return result;
}

test('offline sharing keeps bundled photo requests same-origin and uses explicit font fallbacks', async (t) => {
  for (const page of ['http://localhost:3000/', 'capacitor://localhost/']) {
    await t.test(page, async (subtest) => {
      const fixture = browserFixture(subtest, page, { imageTone: 'night' });
      const result = await renderFromUrl(fixture, {
        background: '/images/daily/morning-01-sunrise.jpg',
        title: 'Bom dia, queridos!',
        mainText: 'Um novo dia começa.',
      });
      assert.equal(fixture.images[0].crossOrigin, null);
      assert.equal(result.blob.type, 'image/jpeg');
      assert.equal(result.width, 1080);
      assert.equal(result.height, 1350);
      assert.ok(fixture.textDraws.some((draw) => draw.font.includes('Georgia')));
      assert.ok(fixture.textDraws.some((draw) => draw.font.includes('Arial')));
    });
  }
});

test('remote sharing keeps anonymous CORS and a stalled image stops waiting', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const fixture = browserFixture(t, 'https://example.com/');
  const result = composeShareImage({ background: 'https://photos.example/photo.jpg', title: 'Bom dia', mainText: 'Um novo dia.' });
  assert.equal(fixture.images[0].crossOrigin, 'anonymous');
  const rejection = assert.rejects(result, /SHARE_IMAGE_LOAD_TIMEOUT/);
  t.mock.timers.tick(15_000);
  await rejection;
  assert.equal(fixture.images[0].onload, null);
  assert.equal(fixture.images[0].onerror, null);
});

test('a white AI response cannot produce a text-only card', async (t) => {
  const fixture = browserFixture(t, 'capacitor://localhost/', { imageTone: 'blank' });
  await assert.rejects(renderFromUrl(fixture, {
    background: 'data:image/png;base64,blank', title: 'Boa noite, queridos!', mainText: 'Bons sonhos.',
  }), /SHARE_IMAGE_BACKGROUND_EMPTY/);
  assert.equal(fixture.textDraws.length, 0);
});

test('manual photo placement moves the text and band together without moving the signature', async (t) => {
  const render = async (position: { x: number; y: number }) => {
    const fixture = browserFixture(t, 'capacitor://localhost/', { imageTone: 'night' });
    await renderFromUrl(fixture, {
      background: '/photo.jpg', title: 'Boa noite, queridos!', mainText: 'Bons sonhos.', textPosition: position,
    });
    return fixture;
  };
  const above = await render({ x: 0.46, y: 0.30 });
  const below = await render({ x: 0.54, y: 0.70 });
  const title = (fixture: ReturnType<typeof browserFixture>) => fixture.textDraws.find((draw) => draw.text === 'Boa noite, queridos!')!;
  const footer = (fixture: ReturnType<typeof browserFixture>) => fixture.textDraws.find((draw) => draw.text === 'app: Bom dia queridos.')!;
  assert.ok(title(below).x > title(above).x);
  assert.ok(title(below).y > title(above).y);
  const bandDelta = below.gradientFills[0].y - above.gradientFills[0].y;
  assert.ok(Math.abs(title(below).y - title(above).y - bandDelta) < 1);
  assert.deepEqual({ x: footer(above).x, y: footer(above).y }, { x: footer(below).x, y: footer(below).y });
  assert.ok(below.gradientFills[0].x > above.gradientFills[0].x);
});

test('manual positions at the edges keep the whole message inside safe margins', async (t) => {
  for (const position of [{ x: -10, y: -10 }, { x: 10, y: 10 }]) {
    const fixture = browserFixture(t, 'capacitor://localhost/', { imageTone: 'day' });
    await renderFromUrl(fixture, {
      background: '/photo.jpg', title: 'Bom dia!', mainText: 'Que a alegria acompanhe cada passo do seu caminho.', quote: 'Com carinho.', textPosition: position,
    });
    const footer = fixture.textDraws.find((draw) => draw.text === 'app: Bom dia queridos.')!;
    for (const line of fixture.textDraws.filter((draw) => draw !== footer)) {
      assert.ok(line.x - line.width / 2 >= 0);
      assert.ok(line.x + line.width / 2 <= 1080);
      assert.ok(line.y > 0 && line.y < footer.y);
    }
    const band = fixture.gradientFills[0];
    assert.ok(band.x >= 0 && band.x + band.width <= 1080);
    assert.ok(band.y >= 0 && band.y + band.height <= 1350);
  }
});

test('balanced wrapping preserves punctuation and avoids an isolated last word', () => {
  const context = { measureText: (text: string) => ({ width: text.length * 10 }) };
  const sentence = 'A cada novo dia, a esperança nos ensina a seguir com fé.';
  const lines = wrapBalancedText(context, sentence, 180);
  assert.equal(lines.join(' '), sentence);
  assert.ok(lines.every((line) => context.measureText(line).width <= 180));
  assert.ok(lines.length >= 2);
  assert.ok(context.measureText(lines.at(-1)!).width >= 50);
  assert.ok(lines.at(-1)!.trim().split(/\s+/).length > 1, 'the final line should not leave a single word alone');
});

test('greetings and message remain readable across portrait output sizes', async (t) => {
  const cases = [
    { width: 1080, height: 1350, title: 'Bom dia, queridos!' },
    { width: 720, height: 900, title: 'Boa tarde, queridos!' },
    { width: 320, height: 400, title: 'Boa noite, queridos!' },
  ];
  const sentence = 'A cada novo dia, a esperança nos ensina a seguir com fé.';

  for (const item of cases) {
    await t.test(`${item.width} × ${item.height}`, async (subtest) => {
      const fixture = browserFixture(subtest, 'capacitor://localhost/', {
        fontsAvailable: true,
        imageTone: 'night',
      });
      const result = await renderFromUrl(fixture, {
        background: '/images/daily/morning-01-sunrise.jpg',
        title: item.title,
        mainText: sentence,
        quote: 'Permaneça firme.',
        width: item.width,
        height: item.height,
      });

      assert.equal(result.width, item.width);
      assert.equal(result.height, item.height);
      assert.deepEqual(fixture.requestedFonts.length, 3);
      assert.ok(fixture.textDraws.some((draw) => draw.text === item.title));
      assert.ok(fixture.textDraws.some((draw) => draw.text === 'app: Bom dia queridos.'));

      const messageDraws = fixture.textDraws.filter((draw) => draw.font.includes('Lora'));
      const mainDraws = messageDraws.filter((draw) => draw.text !== 'Permaneça firme.');
      assert.equal(mainDraws.map((draw) => draw.text).join(' '), sentence);
      assert.ok(mainDraws.every((draw) => draw.textAlign === 'center'));
      assert.ok(mainDraws.every((draw) => draw.fillStyle === '#fffaf0'));
      assert.ok(mainDraws.every((draw) => draw.y < fixture.textDraws.find((entry) => entry.text === 'app: Bom dia queridos.')!.y));
      const messageFontSize = Number(mainDraws[0].font.match(/([\d.]+)px/)?.[1]);
      assert.ok(messageFontSize >= 16);
      assert.ok(messageFontSize <= 58);
      assert.equal(fixture.drawImages[0][0], fixture.images[0]);
      const gradientFill = fixture.gradientFills[0];
      assert.equal(gradientFill.x, 0);
      assert.equal(gradientFill.width, item.width);
      assert.ok(gradientFill.y >= 0);
      assert.ok(gradientFill.y + gradientFill.height <= item.height);
      assert.ok(fixture.strokedText.includes('app: Bom dia queridos.'));
    });
  }
});

test('photo sampling chooses a calm region and the full-width gradient carries contrast across each text line', async (t) => {
  const calmFixture = browserFixture(t, 'https://example.com/', {
    fontsAvailable: true,
    imageTone: 'mid-calm',
  });
  const calmResult = await renderFromUrl(calmFixture, {
    background: '/photo.jpg',
    title: 'Boa noite, queridos!',
    mainText: 'Que a esperança acompanhe seus passos.',
  });
  assert.equal(calmResult.width, 1080);
  assert.ok(calmFixture.sampledCenters.some((center) => Math.abs(center - 0.50) < 0.02));
  const calmGradient = calmFixture.gradientFills[0];
  assert.equal(calmGradient.x, 0);
  assert.equal(calmGradient.width, 1080);
  assert.equal(calmGradient.gradient.x0, 0);
  assert.equal(calmGradient.gradient.x1, 0);
  assert.ok(calmGradient.y >= 0);
  assert.ok(calmGradient.y + calmGradient.height <= 1350);
  assert.equal(calmGradient.gradient.stops[0].color, 'rgba(13, 24, 39, 0)');
  assert.equal(calmGradient.gradient.stops[1].color, 'rgba(13, 24, 39, 0.72)');
  assert.equal(calmGradient.gradient.stops[2].color, 'rgba(13, 24, 39, 0.72)');
  assert.equal(calmGradient.gradient.stops[3].color, 'rgba(13, 24, 39, 0)');
  assert.ok(Math.abs((calmGradient.y + calmGradient.height / 2) / 1350 - 0.50) < 0.02);
  const plateauTop = calmGradient.y + calmGradient.height * calmGradient.gradient.stops[1].offset;
  const plateauBottom = calmGradient.y + calmGradient.height * calmGradient.gradient.stops[2].offset;
  for (const draw of calmFixture.textDraws.filter((entry) => entry.text !== 'app: Bom dia queridos.')) {
    assert.ok(draw.y >= plateauTop && draw.y <= plateauBottom, `${draw.text} fell outside the full-opacity plateau`);
  }

  const dayFixture = browserFixture(t, 'capacitor://localhost/', {
    fontsAvailable: true,
    imageTone: 'day',
  });
  await renderFromUrl(dayFixture, {
    background: '/photo.jpg',
    title: 'Bom dia, queridos!',
    mainText: 'Que a luz de hoje renove as esperanças.',
  });
  const dayMessage = dayFixture.textDraws.find((draw) => draw.text.startsWith('Que a luz'))!;
  assert.equal(dayMessage.fillStyle, '#17302f');
  const dayGradient = dayFixture.gradientFills[0].gradient;
  assert.equal(dayGradient.stops[1].color, 'rgba(255, 250, 240, 0.84)');
  assert.equal(dayFixture.textDraws.find((draw) => draw.text === 'Bom dia, queridos!')!.fillStyle, '#365b50');
  assert.equal(dayFixture.textDraws.find((draw) => draw.text === 'app: Bom dia queridos.')!.fillStyle, 'rgba(23, 48, 47, 0.92)');
  assert.ok(dayFixture.strokedText.includes('app: Bom dia queridos.'));
});

test('footer palette follows its own dark foliage even when the main photo region is bright', async (t) => {
  const fixture = browserFixture(t, 'capacitor://localhost/', {
    fontsAvailable: true,
    imageTone: 'bright-main-dark-footer',
  });
  await renderFromUrl(fixture, {
    background: '/images/daily/morning-16-golden-sunflowers.jpg',
    title: 'Bom dia, queridos!',
    mainText: 'Que a luz de hoje renove as esperanças.',
  });

  const mainMessage = fixture.textDraws.find((draw) => draw.text.startsWith('Que a luz'))!;
  const brand = fixture.textDraws.find((draw) => draw.text === 'app: Bom dia queridos.')!;
  assert.equal(mainMessage.fillStyle, '#17302f');
  assert.equal(brand.fillStyle, 'rgba(255, 250, 240, 0.94)');
  assert.ok(fixture.strokeStyles.includes('rgba(13, 24, 39, 0.82)'));
});

test('a preloaded bitmap works for live previews and an unreadable photo falls back near the upper region', async (t) => {
  const bitmapFixture = browserFixture(t, 'capacitor://localhost/', {
    fontsAvailable: true,
    imageTone: 'night',
  });
  const bitmap = { width: 1200, height: 1500 } as unknown as ImageBitmap;
  const result = await composeShareImage({
    background: bitmap,
    title: 'Boa noite, queridos!',
    mainText: 'A noite também guarda novos começos.',
  });
  assert.equal(result.width, 1080);
  assert.equal(bitmapFixture.images.length, 0);
  assert.equal(bitmapFixture.drawImages[0][0], bitmap);

  const fallbackFixture = browserFixture(t, 'https://example.com/', {
    fontsAvailable: true,
    imageTone: 'unreadable',
  });
  await renderFromUrl(fallbackFixture, {
    background: '/photo.jpg',
    title: 'Boa noite, queridos!',
    mainText: 'A esperança floresce em silêncio.',
  });
  const greetingY = fallbackFixture.textDraws.find((draw) => draw.text === 'Boa noite, queridos!')!.y;
  assert.ok(greetingY < 0.36 * 1350);
  assert.ok(greetingY > 0.18 * 1350);
});

test('long content stays above the brand line and impossible content fails explicitly', async (t) => {
  const fixture = browserFixture(t, 'capacitor://localhost/', {
    fontsAvailable: true,
    imageTone: 'night',
  });
  const longMessage = Array.from({ length: 120 }, (_, index) => ['esperança', 'coragem', 'caminho', 'amanhecer'][index % 4]).join(' ');
  await renderFromUrl(fixture, {
    background: '/photo.jpg',
    title: 'Bom dia, queridos!',
    mainText: longMessage,
  });

  const brand = fixture.textDraws.find((draw) => draw.text === 'app: Bom dia queridos.')!;
  const messageDraws = fixture.textDraws.filter((draw) => draw.font.includes('Lora'));
  assert.equal(messageDraws.map((draw) => draw.text).join(' '), longMessage);
  assert.ok(messageDraws.every((draw) => draw.y < brand.y - 18));
  const mainFontSize = Number(messageDraws[0].font.match(/([\d.]+)px/)?.[1]);
  assert.ok(mainFontSize >= 32, `font shrank below its 32px artwork floor: ${mainFontSize}`);

  const impossibleFixture = browserFixture(t, 'capacitor://localhost/', {
    fontsAvailable: true,
    imageTone: 'night',
  });
  const impossible = renderFromUrl(impossibleFixture, {
    background: '/photo.jpg',
    title: 'Bom dia, queridos!',
    mainText: Array.from({ length: 900 }, () => 'esperança').join(' '),
  });
  await assert.rejects(impossible, /SHARE_IMAGE_TEXT_TOO_LONG/);
});

test('English greeting and longer English brand fit the shared image at small sizes', async (t) => {
  for (const [width, height] of [[1080, 1350], [320, 400]]) {
    await t.test(`${width} x ${height}`, async (subtest) => {
      const fixture = browserFixture(subtest, 'capacitor://localhost/', { fontsAvailable: true, imageTone: 'night' });
      const sentence = 'May your afternoon bring good company and room to breathe.';
      const signature = 'app: Good Morning, Dear Ones.';
      await renderFromUrl(fixture, {
        background: '/images/daily/morning-01-sunrise.jpg',
        title: 'Good afternoon, dear ones!',
        mainText: sentence,
        signature,
        width, height,
      });
      const footer = fixture.textDraws.find((draw) => draw.text === signature);
      assert.ok(footer, 'the English brand must be included');
      assert.ok(footer.width <= width * 0.9, 'the brand must fit inside the safe horizontal bounds');
      const body = fixture.textDraws.filter((draw) => draw.font.includes('Lora'));
      assert.equal(body.map((draw) => draw.text).join(' '), sentence);
      assert.ok(body.every((draw) => draw.y < footer.y), 'the message must stay above the footer');
    });
  }
});
