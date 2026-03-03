/**
 * Generates unique lobby names in the style of Ubuntu codenames
 * Format: adjective-animal (e.g., "rapid-squirrel", "angry-sheep")
 */

const ADJECTIVES = [
  'angry',
  'brave',
  'calm',
  'clever',
  'cosmic',
  'crazy',
  'dancing',
  'daring',
  'eager',
  'fancy',
  'fierce',
  'fluffy',
  'frozen',
  'gentle',
  'golden',
  'happy',
  'hidden',
  'humble',
  'hungry',
  'jolly',
  'jumpy',
  'lazy',
  'little',
  'lucky',
  'magic',
  'mighty',
  'mystic',
  'noble',
  'quick',
  'quiet',
  'rapid',
  'royal',
  'rusty',
  'savage',
  'secret',
  'shadow',
  'shiny',
  'silent',
  'silver',
  'sleepy',
  'sneaky',
  'solar',
  'speedy',
  'spicy',
  'steady',
  'stormy',
  'super',
  'swift',
  'tiny',
  'tricky',
  'vivid',
  'wandering',
  'wild',
  'witty',
  'zany',
  'zen',
];

const ANIMALS = [
  'badger',
  'bear',
  'beaver',
  'buffalo',
  'bunny',
  'camel',
  'cat',
  'cobra',
  'coyote',
  'crane',
  'deer',
  'dingo',
  'dolphin',
  'dragon',
  'eagle',
  'falcon',
  'ferret',
  'fox',
  'frog',
  'gecko',
  'goat',
  'goose',
  'gorilla',
  'hawk',
  'hedgehog',
  'hippo',
  'horse',
  'hyena',
  'ibex',
  'jackal',
  'jaguar',
  'koala',
  'lemur',
  'leopard',
  'lion',
  'lizard',
  'llama',
  'lobster',
  'lynx',
  'marmot',
  'moose',
  'mouse',
  'otter',
  'owl',
  'panda',
  'panther',
  'parrot',
  'penguin',
  'phoenix',
  'pigeon',
  'puma',
  'rabbit',
  'raccoon',
  'raven',
  'rhino',
  'salmon',
  'seal',
  'shark',
  'sheep',
  'sloth',
  'snake',
  'spider',
  'squid',
  'squirrel',
  'stork',
  'tiger',
  'toucan',
  'turtle',
  'viper',
  'walrus',
  'weasel',
  'whale',
  'wolf',
  'wombat',
  'yak',
  'zebra',
];

export class LobbyNameGenerator {
  /**
   * Generate a random lobby name
   */
  static generate(): string {
    const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    return `${adjective}-${animal}`;
  }

  /**
   * Generate multiple unique lobby names
   */
  static generateMultiple(count: number): string[] {
    const names = new Set<string>();
    while (names.size < count) {
      names.add(this.generate());
    }
    return Array.from(names);
  }
}
