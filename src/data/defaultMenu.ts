import margheritaImg from '../assets/images/pizza_margherita_classic_1795082116313.jpg';
import paneerPizzaImg from '../assets/images/pizza_tandoori_paneer_1795082117107.jpg';
import burgerImg from '../assets/images/burger_crispy_supreme_1795082116534.jpg';
import oreoShakeImg from '../assets/images/shake_oreo_cream_1795082116551.jpg';
import strawberryShakeImg from '../assets/images/shake_strawberry_fresh_1795082116008.jpg';
import chocolateShakeImg from '../assets/images/shake_chocolate_fudge_1795082116252.jpg';
import coldDrinksImg from '../assets/images/cold_drinks_assorted_1795082116466.jpg';
import pepsiImg from '../assets/images/drink_pepsi_chilled_1795089967636.jpg';
import cocaColaImg from '../assets/images/drink_cocacola_chilled_1795089966576.jpg';
import thumsUpImg from '../assets/images/drink_thumsup_chilled_1795089966697.jpg';
import redBullImg from '../assets/images/drink_redbull_energy_1795089966558.jpg';
import chipsImg from '../assets/images/snacks_potato_chips_1795082116526.jpg';
import kurkureImg from '../assets/images/snacks_masala_kurkure_1795082116532.jpg';
import type {
  CafeRatingRecord,
  CafeStoreData,
  ComboSet,
  LoyaltyState,
  Product,
} from '../types';

export const STORAGE_KEY = 'four_guys_cafe_menu_v3';
export const CART_STORAGE_KEY = 'four_guys_cafe_cart_v1';
export const HOME_CART_STORAGE_KEY = 'four_guys_cafe_home_cart_v1';
export const HOME_ORDERS_STORAGE_KEY = 'four_guys_cafe_home_orders_v1';
export const TABLE_ORDERS_STORAGE_KEY = 'four_guys_cafe_table_orders_v1';
export const HOME_PROFILES_STORAGE_KEY = 'four_guys_cafe_home_profiles_v1';
export const LAST_ORDER_AT_STORAGE_KEY = 'four_guys_cafe_last_order_at_v1';
export const ADMIN_LOCK_STORAGE_KEY = 'four_guys_cafe_admin_lock_v1';
export const RATINGS_STORAGE_KEY = 'four_guys_cafe_ratings_v1';
export const LOYALTY_STORAGE_KEY = 'four_guys_cafe_loyalty_v1';
export const VIBE_WALL_STORAGE_KEY = 'four_guys_cafe_vibe_wall_v1';
export const REFERRALS_STORAGE_KEY = 'four_guys_cafe_referrals_v1';
export const COMBOS_CATEGORY_ID = 'cat-combos';

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `4GUYS-${suffix}`;
}

export const DEFAULT_LOYALTY_STATE: LoyaltyState = {
  points: 0,
  totalEarned: 0,
  spinsLeft: 1,
  ordersCompleted: 0,
  totalPurchaseAmount: 0,
  referralCode: '',
  pendingRefCode: null,
  referredByClaimed: false,
  claimedReferralCodes: [],
  creditedOrderIds: [],
  referralCount: 0,
  referralEarningsSpins: 0,
  referralOrderAmount: 0,
  badges: [],
  lastSpinDate: null,
  spinsToday: 0,
  history: [
    {
      id: 'welcome-spin',
      label: 'First Visit Welcome Bonus (+1 Free Spin)',
      delta: 0,
      timestamp: new Date().toISOString(),
    },
  ],
};

export const DEFAULT_STARTER_RATINGS: CafeRatingRecord[] = [
  {
    id: 'sample-rating-1',
    authorName: 'Aman Tiwari',
    stars: 5,
    comment:
      'Best ₹110 Margherita Pizza and chilled Oreo Shake in Bilhaur! Fast table service.',
    orderMode: 'dine-in',
    createdAt: '2026-10-12T17:30:00.000Z',
    isSample: true,
  },
  {
    id: 'sample-rating-2',
    authorName: 'Priya Singh',
    stars: 5,
    comment:
      'Ordered the Burger + Shake Combo via Home Order — reached Kakawan Road hot and fresh.',
    orderMode: 'home',
    createdAt: '2026-10-18T19:15:00.000Z',
    isSample: true,
  },
  {
    id: 'sample-rating-3',
    authorName: 'Rohit Yadav',
    stars: 4,
    comment:
      'Tandoori Paneer Pizza and Loaded Kurkure Chaat Bowl are must-tries with friends.',
    orderMode: 'dine-in',
    createdAt: '2026-10-25T16:40:00.000Z',
    isSample: true,
  },
  {
    id: 'sample-rating-4',
    authorName: 'Saurabh Gupta',
    stars: 5,
    comment:
      'Super clean QR live bill — easy to add Thums Up mid-meal without confusion.',
    orderMode: 'dine-in',
    createdAt: '2026-11-02T18:10:00.000Z',
    isSample: true,
  },
];

export function comboToCartProduct(combo: ComboSet): Product {
  const breakdown = combo.items
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(' + ');
  return {
    id: combo.id,
    name: combo.name,
    categoryId: COMBOS_CATEGORY_ID,
    price: combo.price,
    description: breakdown || combo.description,
    image: combo.image,
    available: combo.available !== false,
    homeOrderEnabled: combo.homeOrderEnabled !== false,
    isCombo: true,
    comboItems: combo.items,
    highlightBadge: combo.highlightBadge,
  };
}

export const DEFAULT_CAFE_DATA: CafeStoreData = {
  settings: {
    cafeName: 'FOUR GUYS CAFE',
    tagline: 'Bilhaur’s Pizza King 👑',
    subtitle: 'Pizza • Burgers • Shakes • Cold Drinks • Snacks',
    location: 'Master Market, Road, Kakawan, Bilhaur, Uttar Pradesh 209202, India',
    email: 'admin@fourguys.in',
    facebook: 'FOUR GUYS CAFE',
    instagram: '@fourguyscafe',
    socialLinks: [
      {
        id: 'soc-facebook',
        platform: 'Facebook',
        label: 'FOUR GUYS CAFE',
        url: 'https://www.facebook.com',
      },
      {
        id: 'soc-instagram',
        platform: 'Instagram',
        label: '@fourguyscafe',
        url: 'https://www.instagram.com/fourguyscafe',
      },
    ],
    whatsappNumber: '919651008080',
    homeWhatsappNumber: '',
    homeMinOrder: 150,
    homeDeliveryFee: 0,
    homeDeliveryNote:
      'Freshly prepared to order (20–30 mins). No Return Policy applies once preparation starts.',
    timings: 'Open Daily · 11:00 AM – 11:00 PM',
    isCafeOpen: true,
    closedNotice: '',
    adminId: '',
    adminMobile: '',
    adminPin: '',
    orderCooldownSeconds: 120,
    highQuantityThreshold: 10,
    loyaltyEnabled: true,
    pointsPer100Rupees: 10,
    rewardThresholdPoints: 100,
    pointsDiscountPerThreshold: 30,
    rewardLabel: 'Free Cold Drink or ₹30 Off',
    upiId: '',
    upiPayeeName: 'FOUR GUYS CAFE',
    firstVisitSpins: 1,
    firstOrderSpins: 2,
    repeatOrderSpins: 1,
    referralSpins: 5,
    midTierUnlockSpend: 500,
    highTierUnlockSpend: 1000,
  },
  categories: [
    {
      id: 'cat-combos',
      name: 'Combos',
      subtitle: 'Value meal sets — Pizza + Drink, Burger + Shake & Feast',
      image: paneerPizzaImg,
    },
    {
      id: 'cat-cold-drinks',
      name: 'Cold Drinks',
      subtitle: 'Pepsi, Coca-Cola, Thums Up packs, cans & Red Bull',
      image: coldDrinksImg,
    },
    {
      id: 'cat-pizza',
      name: 'Pizza',
      subtitle: 'Oven-baked ₹110 Margherita & paneer specials',
      image: margheritaImg,
    },
    {
      id: 'cat-burgers',
      name: 'Burgers',
      subtitle: 'Crispy golden patties & melted cheese buns',
      image: burgerImg,
    },
    {
      id: 'cat-shakes',
      name: 'Shakes',
      subtitle: 'Oreo Shake, Strawberry Shake & Chocolate Shake',
      image: oreoShakeImg,
    },
    {
      id: 'cat-chips',
      name: 'Chips',
      subtitle: 'Crispy salted & spicy masala potato chips',
      image: chipsImg,
    },
    {
      id: 'cat-kurkure',
      name: 'Kurkure',
      subtitle: 'Crunchy masala puffs & chatpata snack bowls',
      image: kurkureImg,
    },
  ],
  products: [
    // Cold Drinks — Pepsi (₹20 Pack & Can excluded from Home Order by default)
    {
      id: 'prod-pepsi-20',
      name: 'Pepsi - ₹20 Pack',
      categoryId: 'cat-cold-drinks',
      price: 20,
      description: 'Chilled Pepsi ₹20 pocket pack served cold straight from the cooler.',
      image: pepsiImg,
      available: true,
      homeOrderEnabled: false,
    },
    {
      id: 'prod-pepsi-40',
      name: 'Pepsi - ₹40 Bottle',
      categoryId: 'cat-cold-drinks',
      price: 40,
      description: 'Chilled Pepsi ₹40 sharing bottle — crisp, fizzy cola refreshment.',
      image: pepsiImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-pepsi-can',
      name: 'Pepsi - Can',
      categoryId: 'cat-cold-drinks',
      price: 60,
      description: 'Ice-cold 330ml Pepsi metallic Can (default ₹60 — adjustable in Admin).',
      image: pepsiImg,
      available: true,
      homeOrderEnabled: false,
    },

    // Cold Drinks — Coca-Cola (₹20 Pack & Can excluded from Home Order by default)
    {
      id: 'prod-coke-20',
      name: 'Coca-Cola - ₹20 Pack',
      categoryId: 'cat-cold-drinks',
      price: 20,
      description: 'Chilled Coca-Cola ₹20 pack — classic sparkling cola taste.',
      image: cocaColaImg,
      available: true,
      homeOrderEnabled: false,
    },
    {
      id: 'prod-coke-40',
      name: 'Coca-Cola - ₹40 Bottle',
      categoryId: 'cat-cold-drinks',
      price: 40,
      description: 'Chilled Coca-Cola ₹40 bottle — great to pair with pizza & burgers.',
      image: cocaColaImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-coke-can',
      name: 'Coca-Cola - Can',
      categoryId: 'cat-cold-drinks',
      price: 60,
      description: 'Ice-cold 330ml Coca-Cola Classic Can (default ₹60 — adjustable in Admin).',
      image: cocaColaImg,
      available: true,
      homeOrderEnabled: false,
    },

    // Cold Drinks — Thums Up (₹20 Pack & Can excluded from Home Order by default)
    {
      id: 'prod-thumsup-20',
      name: 'Thums Up - ₹20 Pack',
      categoryId: 'cat-cold-drinks',
      price: 20,
      description: 'Chilled Thums Up ₹20 pack with bold, strong Indian cola fizz.',
      image: thumsUpImg,
      available: true,
      homeOrderEnabled: false,
    },
    {
      id: 'prod-thumsup-40',
      name: 'Thums Up - ₹40 Bottle',
      categoryId: 'cat-cold-drinks',
      price: 40,
      description: 'Chilled Thums Up ₹40 bottle — strong thunderous fizz served cold.',
      image: thumsUpImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-thumsup-can',
      name: 'Thums Up - Can',
      categoryId: 'cat-cold-drinks',
      price: 60,
      description: 'Ice-cold 330ml Thums Up Can (default ₹60 — adjustable in Admin).',
      image: thumsUpImg,
      available: true,
      homeOrderEnabled: false,
    },

    // Cold Drinks — Red Bull
    {
      id: 'prod-redbull-can',
      name: 'Red Bull - Can',
      categoryId: 'cat-cold-drinks',
      price: 125,
      description: 'Chilled 250ml Red Bull Energy Drink Can (default ₹125 — adjustable in Admin).',
      image: redBullImg,
      available: true,
      homeOrderEnabled: true,
    },

    // Pizza
    {
      id: 'prod-margherita-pizza',
      name: 'Classic Margherita Pizza',
      categoryId: 'cat-pizza',
      price: 110,
      description: 'Hand-stretched crust topped with rich tomato herb sauce, bubbling mozzarella, and fresh basil.',
      image: margheritaImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-corn-cheese-pizza',
      name: 'Sweet Corn & Cheese Pizza',
      categoryId: 'cat-pizza',
      price: 130,
      description: 'Golden sweet corn kernels baked over creamy liquid cheese and mozzarella on a crisp base.',
      image: margheritaImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-tandoori-paneer-pizza',
      name: 'Tandoori Paneer Pizza',
      categoryId: 'cat-pizza',
      price: 160,
      description: 'Spiced tandoori paneer cubes, crisp capsicum, red onions, and double mozzarella cheese.',
      image: paneerPizzaImg,
      available: true,
      homeOrderEnabled: true,
      highlightBadge: 'bestseller',
    },
    {
      id: 'prod-four-guys-special-pizza',
      name: 'Four Guys King Loaded Pizza',
      categoryId: 'cat-pizza',
      price: 190,
      description: 'Our signature Bilhaur special loaded with paneer, olives, jalapeños, sweet corn, and extra cheese.',
      image: paneerPizzaImg,
      available: true,
      homeOrderEnabled: true,
      highlightBadge: 'special',
    },

    // Burgers
    {
      id: 'prod-crispy-veg-burger',
      name: 'Crispy Cheese Burger',
      categoryId: 'cat-burgers',
      price: 70,
      description: 'Golden herb-crusted patty, melted cheddar slice, crisp lettuce, tomato, and signature cafe mayo.',
      image: burgerImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-double-tikki-burger',
      name: 'Double Patty King Burger',
      categoryId: 'cat-burgers',
      price: 100,
      description: 'Twin crunchy aloo-veggie patties stacked with double cheese, caramelized onions, and tangy sauce.',
      image: burgerImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-paneer-crunch-burger',
      name: 'Spicy Paneer Crunch Burger',
      categoryId: 'cat-burgers',
      price: 110,
      description: 'Crispy spiced paneer fillet inside a toasted sesame brioche bun with mint-garlic dressing.',
      image: burgerImg,
      available: true,
      homeOrderEnabled: true,
    },

    // Shakes
    {
      id: 'prod-oreo-shake',
      name: 'Oreo Shake',
      categoryId: 'cat-shakes',
      price: 90,
      description: 'Creamy vanilla ice cream blended thick with crushed Oreo cookies and topped with cookie crumble.',
      image: oreoShakeImg,
      available: true,
      homeOrderEnabled: true,
      highlightBadge: 'bestseller',
    },
    {
      id: 'prod-strawberry-shake',
      name: 'Strawberry Shake',
      categoryId: 'cat-shakes',
      price: 85,
      description: 'Chilled strawberry milkshake swirled with whipped cream and sweet berry compote.',
      image: strawberryShakeImg,
      available: true,
      homeOrderEnabled: true,
    },
    {
      id: 'prod-chocolate-shake',
      name: 'Chocolate Shake',
      categoryId: 'cat-shakes',
      price: 95,
      description: 'Indulgent dark chocolate thick shake finished with rich fudge drizzle and chocolate curls.',
      image: chocolateShakeImg,
      available: true,
      homeOrderEnabled: true,
    },

    // Chips
    {
      id: 'prod-classic-salted-chips',
      name: 'Classic Salted Kettle Chips',
      categoryId: 'cat-chips',
      price: 30,
      description: 'Thinly sliced, golden-fried crispy potato chips lightly tossed with sea salt.',
      image: chipsImg,
      available: true,
      homeOrderEnabled: false,
    },
    {
      id: 'prod-masala-chips-bowl',
      name: 'Cafe Peri-Peri Masala Chips',
      categoryId: 'cat-chips',
      price: 45,
      description: 'Crunchy potato crisps dusted with smoky peri-peri spice and served with creamy dip.',
      image: chipsImg,
      available: true,
      homeOrderEnabled: true,
    },

    // Kurkure
    {
      id: 'prod-masala-kurkure-pack',
      name: 'Masala Munch Kurkure',
      categoryId: 'cat-kurkure',
      price: 25,
      description: 'Classic crunchy spicy masala corn curls — the perfect crisp companion for cold drinks.',
      image: kurkureImg,
      available: true,
      homeOrderEnabled: false,
    },
    {
      id: 'prod-kurkure-chaat-bowl',
      name: 'Loaded Kurkure Chaat Bowl',
      categoryId: 'cat-kurkure',
      price: 60,
      description: 'Crunchy Kurkure tossed with diced onions, tomatoes, fresh coriander, lemon juice & green chutney.',
      image: kurkureImg,
      available: true,
      homeOrderEnabled: true,
    },
  ],
  combos: [
    {
      id: 'combo-pizza-coke',
      name: 'Pizza + Cold Drink Combo',
      description:
        'Oven-fresh Classic ₹110 Margherita Pizza paired with a chilled Coca-Cola ₹40 Bottle.',
      price: 140,
      originalPrice: 150,
      image: margheritaImg,
      available: true,
      dineInEnabled: true,
      homeOrderEnabled: true,
      highlightBadge: 'bestseller',
      items: [
        {
          productId: 'prod-margherita-pizza',
          name: 'Classic Margherita Pizza',
          quantity: 1,
          unitPrice: 110,
        },
        {
          productId: 'prod-coke-40',
          name: 'Coca-Cola - ₹40 Bottle',
          quantity: 1,
          unitPrice: 40,
        },
      ],
    },
    {
      id: 'combo-burger-oreo-shake',
      name: 'Burger + Shake Combo',
      description:
        'Crispy Cheese Burger served with a thick creamy Oreo Shake — qualifies directly for ₹150 Home Order.',
      price: 150,
      originalPrice: 160,
      image: burgerImg,
      available: true,
      dineInEnabled: true,
      homeOrderEnabled: true,
      items: [
        {
          productId: 'prod-crispy-veg-burger',
          name: 'Crispy Cheese Burger',
          quantity: 1,
          unitPrice: 70,
        },
        {
          productId: 'prod-oreo-shake',
          name: 'Oreo Shake',
          quantity: 1,
          unitPrice: 90,
        },
      ],
    },
    {
      id: 'combo-value-feast-150',
      name: '₹150+ Value Feast Combo',
      description:
        'Tandoori Paneer Pizza, Loaded Kurkure Chaat Bowl & chilled Pepsi ₹40 Bottle for sharing.',
      price: 235,
      originalPrice: 260,
      image: paneerPizzaImg,
      available: true,
      dineInEnabled: true,
      homeOrderEnabled: true,
      highlightBadge: 'special',
      items: [
        {
          productId: 'prod-tandoori-paneer-pizza',
          name: 'Tandoori Paneer Pizza',
          quantity: 1,
          unitPrice: 160,
        },
        {
          productId: 'prod-kurkure-chaat-bowl',
          name: 'Loaded Kurkure Chaat Bowl',
          quantity: 1,
          unitPrice: 60,
        },
        {
          productId: 'prod-pepsi-40',
          name: 'Pepsi - ₹40 Bottle',
          quantity: 1,
          unitPrice: 40,
        },
      ],
    },
    {
      id: 'combo-table-chill-crunch',
      name: 'Table Chill & Crunch Combo',
      description:
        'Crispy Cheese Burger, Thums Up ₹20 Pack & Masala Munch Kurkure — quick table hangout meal.',
      price: 105,
      originalPrice: 115,
      image: thumsUpImg,
      available: true,
      dineInEnabled: true,
      homeOrderEnabled: false,
      items: [
        {
          productId: 'prod-crispy-veg-burger',
          name: 'Crispy Cheese Burger',
          quantity: 1,
          unitPrice: 70,
        },
        {
          productId: 'prod-thumsup-20',
          name: 'Thums Up - ₹20 Pack',
          quantity: 1,
          unitPrice: 20,
        },
        {
          productId: 'prod-masala-kurkure-pack',
          name: 'Masala Munch Kurkure',
          quantity: 1,
          unitPrice: 25,
        },
      ],
    },
  ],
};
