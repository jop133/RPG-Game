// Culling para mapas grandes (só desenho). O Phaser descarta sozinho os tiles fora da tela, mas não as imagens:
// num andar 500x500 com milhares de enfeites e centenas de luzes, percorrer e desenhar tudo a cada quadro pesaria.
// Aqui o mapa é dividido em blocos de CHUNK px e cada coisa fixa fica registrada nos blocos que a sua caixa toca:
// achar o que está perto da câmera custa só os blocos em volta dela, não o mapa inteiro.

const CHUNK = 512;
// Folga em volta da câmera: o que está logo fora da tela já fica pronto (tremor de tela, câmera andando).
export const CULL_MARGIN = 256;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function chunkRange(box: Box): { c0: number; r0: number; c1: number; r1: number } {
  return {
    c0: Math.floor(box.left / CHUNK),
    r0: Math.floor(box.top / CHUNK),
    c1: Math.floor(box.right / CHUNK),
    r1: Math.floor(box.bottom / CHUNK),
  };
}

// Caixa da câmera com folga, em coordenadas do mundo.
export function around(view: { x: number; y: number; right: number; bottom: number }, margin: number): Box {
  return { left: view.x - margin, top: view.y - margin, right: view.right + margin, bottom: view.bottom + margin };
}

export class ChunkIndex<T> {
  private readonly chunks = new Map<string, T[]>();

  add(item: T, box: Box) {
    const { c0, r0, c1, r1 } = chunkRange(box);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = `${c},${r}`;
        const list = this.chunks.get(key);
        if (list) list.push(item);
        else this.chunks.set(key, [item]);
      }
    }
  }

  // Tudo o que está nos blocos que a caixa toca (pode vir um pouco a mais: a precisão é o bloco).
  query(box: Box): Set<T> {
    const found = new Set<T>();
    const { c0, r0, c1, r1 } = chunkRange(box);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) for (const item of this.chunks.get(`${c},${r}`) ?? []) found.add(item);
    }
    return found;
  }

  // Identifica o conjunto de blocos que a caixa toca: igual = a consulta daria o mesmo resultado.
  static rangeKey(box: Box): string {
    const { c0, r0, c1, r1 } = chunkRange(box);
    return `${c0},${r0},${c1},${r1}`;
  }
}

interface Showable {
  setVisible(value: boolean): unknown;
}

// Objetos fixos do mapa (enfeites, prédios, paredões) e as sombras deles: fora da câmera (com folga) ficam
// invisíveis, e o Phaser não os desenha. Só muda algo quando a câmera cruza a borda de um bloco.
export class StaticCuller {
  private readonly index = new ChunkIndex<Showable>();
  private shown = new Set<Showable>();
  private range = "";

  add(object: Showable, box: Box) {
    this.index.add(object, box);
    object.setVisible(false);
  }

  update(view: { x: number; y: number; right: number; bottom: number }) {
    const box = around(view, CULL_MARGIN);
    const key = ChunkIndex.rangeKey(box);
    if (key === this.range) return;
    this.range = key;
    const next = this.index.query(box);
    for (const object of this.shown) if (!next.has(object)) object.setVisible(false);
    for (const object of next) if (!this.shown.has(object)) object.setVisible(true);
    this.shown = next;
  }

  get visibleCount(): number {
    return this.shown.size;
  }
}

// Luzes fixas do mapa por bloco: a cada quadro, só as que podem tocar a tela entram no desenho (cada uma registrada
// pela caixa do seu raio). O resultado é reaproveitado enquanto a câmera não muda de blocos.
export class LightIndex<T extends { x: number; y: number; radius: number }> {
  private readonly index = new ChunkIndex<T>();
  private range = "";
  private near: T[] = [];

  constructor(lights: readonly T[]) {
    for (const light of lights) {
      const r = light.radius;
      this.index.add(light, { left: light.x - r, top: light.y - r, right: light.x + r, bottom: light.y + r });
    }
  }

  around(view: { x: number; y: number; right: number; bottom: number }): readonly T[] {
    const box = around(view, CULL_MARGIN);
    const key = ChunkIndex.rangeKey(box);
    if (key !== this.range) {
      this.range = key;
      this.near = [...this.index.query(box)];
    }
    return this.near;
  }
}
