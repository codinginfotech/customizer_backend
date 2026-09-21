"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable no-console */
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
const J = (v) => v;
async function seedUsers() {
    const adminHash = await bcryptjs_1.default.hash('Admin123!', 12);
    const demoHash = await bcryptjs_1.default.hash('Demo1234', 12);
    await prisma.user.upsert({
        where: { email: 'admin@customizer.dev' },
        update: {},
        create: {
            name: 'Platform Admin',
            email: 'admin@customizer.dev',
            passwordHash: adminHash,
            role: 'ADMIN',
            emailVerified: true,
        },
    });
    await prisma.user.upsert({
        where: { email: 'demo@customizer.dev' },
        update: {},
        create: {
            name: 'Demo User',
            email: 'demo@customizer.dev',
            passwordHash: demoHash,
            role: 'USER',
            emailVerified: true,
        },
    });
    console.log('✓ Users (admin@customizer.dev / Admin123!, demo@customizer.dev / Demo1234)');
}
async function seedCategories() {
    const categories = [
        { name: 'Apparel', slug: 'apparel', description: 'T-shirts, hoodies, joggers and more', sortOrder: 1 },
        { name: 'Accessories', slug: 'accessories', description: 'Caps, bags and everyday carry', sortOrder: 2 },
        { name: 'Drinkware', slug: 'drinkware', description: 'Mugs, bottles and tumblers', sortOrder: 3 },
        { name: 'Kitchen & Dining', slug: 'kitchen-cookware', description: 'Pans, plates and bowls', sortOrder: 4 },
        { name: 'Home & Living', slug: 'home-living', description: 'Pillows, cushions and decor', sortOrder: 5 },
        { name: 'Stationery', slug: 'stationery', description: 'Notebooks, journals and paper goods', sortOrder: 6 },
        { name: 'Tech', slug: 'tech-home', description: 'Phone cases, mouse pads and desk gear', sortOrder: 7 },
    ];
    for (const c of categories) {
        await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
    }
    console.log('✓ Categories');
    const all = await prisma.category.findMany();
    return Object.fromEntries(all.map((c) => [c.slug, c.id]));
}
/** Standard turntable views; per-product entries override/extend. */
function standardViews(overrides = {}) {
    return {
        default: { azimuth: 28, polar: 78, zoom: 1 },
        front: { azimuth: 0, polar: 82, zoom: 1 },
        back: { azimuth: 180, polar: 82, zoom: 1 },
        left: { azimuth: -90, polar: 82, zoom: 1 },
        right: { azimuth: 90, polar: 82, zoom: 1 },
        top: { azimuth: 10, polar: 18, zoom: 1 },
        ...overrides,
    };
}
function modelConfig(p) {
    return {
        type: 'GLTF',
        meshBindings: Object.entries(p.model.zones).map(([areaKey, mode]) => ({
            mesh: `zone_${areaKey}`,
            areaKey,
            mode,
        })),
        colorMeshes: p.model.colorMeshes,
        materials: p.model.materials ?? {},
        partLabels: p.model.partLabels ?? {},
        cameraViews: standardViews(p.model.views),
        lighting: p.model.lighting ?? 'studio',
        cameraDistance: p.model.cameraDistance ?? 2.2,
        metalness: 0.05,
        roughness: 0.85,
    };
}
function apparelVariants(prefix, colors, sizes) {
    const variants = [];
    for (const [hex, colorName] of colors) {
        for (const size of sizes) {
            variants.push({
                name: `${colorName} / ${size}`,
                color: hex,
                colorName,
                size,
                sku: `${prefix}-${colorName.replace(/\s/g, '').toUpperCase().slice(0, 4)}-${size}`,
                stock: 120,
            });
        }
    }
    return variants;
}
const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const APPAREL_COLORS = [
    ['#f4f4f2', 'White'],
    ['#23252a', 'Black'],
    ['#24405f', 'Navy'],
    ['#a02c2c', 'Red'],
    ['#9aa1ab', 'Heather Gray'],
];
const PRODUCTS = [
    {
        slug: 'classic-cotton-tshirt',
        name: 'Classic Cotton T-Shirt',
        categorySlug: 'apparel',
        description: 'A premium 180 GSM combed-cotton tee with a smooth print surface. Design the front, back and both sleeves — the live 3D preview shows your art draped on real fabric.',
        basePrice: 14.99,
        featured: true,
        image: '/images/products/tshirt.svg',
        tags: ['best_seller', 'customizable', 'featured'],
        metadata: { material: '100% combed cotton, 180 GSM', careInstructions: 'Machine wash cold, tumble dry low', weightGrams: 190, shippingClass: 'standard' },
        printMethods: ['dtg', 'dtf', 'screen_print'],
        areas: [
            { key: 'front', name: 'Front', width: 450, height: 550, safeArea: { x: 40, y: 50, width: 370, height: 450 }, physicalWidthIn: 12, physicalHeightIn: 14.7, mockup: { left: 31, top: 26, width: 38, height: 46 }, templateImage: '/images/products/tshirt.svg', sortOrder: 0 },
            { key: 'back', name: 'Back', width: 450, height: 550, safeArea: { x: 40, y: 50, width: 370, height: 450 }, physicalWidthIn: 12, physicalHeightIn: 14.7, mockup: { left: 31, top: 24, width: 38, height: 46 }, templateImage: '/images/products/tshirt-back.svg', sortOrder: 1 },
            { key: 'left_sleeve', name: 'Left Sleeve', width: 200, height: 220, safeArea: { x: 20, y: 20, width: 160, height: 180 }, physicalWidthIn: 4, physicalHeightIn: 4.4, mockup: { left: 8, top: 30, width: 15, height: 16, rotate: -12 }, templateImage: '/images/products/tshirt.svg', sortOrder: 2 },
            { key: 'right_sleeve', name: 'Right Sleeve', width: 200, height: 220, safeArea: { x: 20, y: 20, width: 160, height: 180 }, physicalWidthIn: 4, physicalHeightIn: 4.4, mockup: { left: 77, top: 30, width: 15, height: 16, rotate: 12 }, templateImage: '/images/products/tshirt.svg', sortOrder: 3 },
        ],
        variants: apparelVariants('TSH', APPAREL_COLORS, SIZES),
        model: {
            modelUrl: '/models/tshirt.glb',
            zones: { front: 'overlay', back: 'overlay', left_sleeve: 'overlay', right_sleeve: 'overlay' },
            colorMeshes: ['body', 'collar', 'sleeve_left', 'sleeve_right', 'cuff_left', 'cuff_right'],
            partLabels: { body: 'Front', collar: 'Collar', sleeve_left: 'Left sleeve', sleeve_right: 'Right sleeve' },
            cameraDistance: 2.4,
            views: { default: { azimuth: 22, polar: 80 } },
        },
    },
    {
        slug: 'pullover-hoodie',
        name: 'Pullover Hoodie',
        categorySlug: 'apparel',
        description: 'Heavyweight fleece hoodie with a double-lined hood and kangaroo pocket. Five printable zones including the pocket.',
        basePrice: 34.99,
        featured: true,
        image: '/images/products/hoodie.svg',
        tags: ['popular', 'customizable'],
        metadata: { material: '80/20 cotton-poly fleece, 320 GSM', careInstructions: 'Machine wash cold inside out', weightGrams: 560, shippingClass: 'standard' },
        printMethods: ['dtg', 'dtf', 'embroidery'],
        areas: [
            { key: 'front', name: 'Front', width: 450, height: 500, safeArea: { x: 45, y: 60, width: 360, height: 320 }, physicalWidthIn: 12, physicalHeightIn: 13.3, mockup: { left: 30, top: 28, width: 40, height: 38 }, templateImage: '/images/products/hoodie.svg', sortOrder: 0 },
            { key: 'back', name: 'Back', width: 450, height: 550, safeArea: { x: 45, y: 50, width: 360, height: 450 }, physicalWidthIn: 12, physicalHeightIn: 14.7, mockup: { left: 30, top: 24, width: 40, height: 48 }, templateImage: '/images/products/hoodie-back.svg', sortOrder: 1 },
            { key: 'left_sleeve', name: 'Left Sleeve', width: 200, height: 240, safeArea: { x: 20, y: 20, width: 160, height: 200 }, physicalWidthIn: 4, physicalHeightIn: 4.8, mockup: { left: 7, top: 34, width: 15, height: 18, rotate: -14 }, templateImage: '/images/products/hoodie.svg', sortOrder: 2 },
            { key: 'right_sleeve', name: 'Right Sleeve', width: 200, height: 240, safeArea: { x: 20, y: 20, width: 160, height: 200 }, physicalWidthIn: 4, physicalHeightIn: 4.8, mockup: { left: 78, top: 34, width: 15, height: 18, rotate: 14 }, templateImage: '/images/products/hoodie.svg', sortOrder: 3 },
            { key: 'pocket', name: 'Pocket', width: 300, height: 160, safeArea: { x: 25, y: 15, width: 250, height: 130 }, physicalWidthIn: 8, physicalHeightIn: 4.3, mockup: { left: 34, top: 62, width: 32, height: 13 }, templateImage: '/images/products/hoodie.svg', sortOrder: 4 },
        ],
        variants: apparelVariants('HOD', [['#23252a', 'Black'], ['#4b5563', 'Charcoal'], ['#24405f', 'Navy'], ['#6b2130', 'Maroon']], SIZES),
        model: {
            modelUrl: '/models/hoodie.glb',
            zones: { front: 'overlay', back: 'overlay', left_sleeve: 'overlay', right_sleeve: 'overlay', pocket: 'overlay' },
            colorMeshes: ['body', 'hood', 'pocket', 'sleeve_left', 'sleeve_right', 'cuff_left', 'cuff_right'],
            partLabels: { body: 'Front', hood: 'Hood', pocket: 'Pocket', sleeve_left: 'Left sleeve', sleeve_right: 'Right sleeve' },
            cameraDistance: 2.5,
            views: { default: { azimuth: 20, polar: 80 } },
        },
    },
    {
        slug: 'comfort-joggers',
        name: 'Comfort Joggers',
        categorySlug: 'apparel',
        description: 'French-terry joggers with a tapered fit and ribbed cuffs. Print on either leg and inspect the drape in 3D.',
        basePrice: 27.99,
        featured: false,
        image: '/images/products/joggers.svg',
        tags: ['customizable'],
        metadata: { material: 'French terry, 300 GSM', weightGrams: 430, shippingClass: 'standard' },
        printMethods: ['dtg', 'dtf'],
        areas: [
            { key: 'left_leg', name: 'Left Leg', width: 250, height: 500, safeArea: { x: 25, y: 40, width: 200, height: 420 }, physicalWidthIn: 6, physicalHeightIn: 12, mockup: { left: 24, top: 38, width: 21, height: 48, rotate: -3 }, templateImage: '/images/products/joggers.svg', sortOrder: 0 },
            { key: 'right_leg', name: 'Right Leg', width: 250, height: 500, safeArea: { x: 25, y: 40, width: 200, height: 420 }, physicalWidthIn: 6, physicalHeightIn: 12, mockup: { left: 55, top: 38, width: 21, height: 48, rotate: 3 }, templateImage: '/images/products/joggers.svg', sortOrder: 1 },
        ],
        variants: apparelVariants('JOG', [['#23252a', 'Black'], ['#4b5563', 'Charcoal'], ['#24405f', 'Navy']], SIZES),
        model: {
            modelUrl: '/models/joggers.glb',
            zones: { left_leg: 'overlay', right_leg: 'overlay' },
            colorMeshes: ['hips', 'waistband', 'leg_left_mesh', 'leg_right_mesh'],
            partLabels: { leg_left_mesh: 'Left leg', leg_right_mesh: 'Right leg', waistband: 'Waistband' },
            cameraDistance: 2.6,
        },
    },
    {
        slug: 'ceramic-mug',
        name: 'Ceramic Mug',
        categorySlug: 'drinkware',
        description: 'Dishwasher-safe 11oz glazed ceramic mug. Your design wraps 300° around the body in the live 3D preview — the handle stays clear.',
        basePrice: 9.99,
        featured: true,
        image: '/images/products/mug.svg',
        tags: ['best_seller', 'featured'],
        metadata: { material: 'Glazed ceramic', careInstructions: 'Dishwasher & microwave safe', weightGrams: 330, shippingClass: 'fragile' },
        printMethods: ['sublimation', 'uv_print'],
        areas: [
            { key: 'wrap', name: 'Wrap', width: 800, height: 340, safeArea: { x: 40, y: 25, width: 720, height: 290 }, physicalWidthIn: 8.5, physicalHeightIn: 3.6, mockup: { left: 22, top: 30, width: 48, height: 42 }, templateImage: '/images/products/mug.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'White / 11oz', color: '#f6f5f2', colorName: 'White', size: '11oz', sku: 'MUG-WHT-11', stock: 500 },
            { name: 'Black / 11oz', color: '#26282c', colorName: 'Black', size: '11oz', sku: 'MUG-BLK-11', stock: 400 },
            { name: 'Blue / 11oz', color: '#2d5aa0', colorName: 'Blue', size: '11oz', sku: 'MUG-BLU-11', stock: 300 },
            { name: 'White / 15oz', color: '#f6f5f2', colorName: 'White', size: '15oz', sku: 'MUG-WHT-15', price: 12.99, stock: 250 },
        ],
        model: {
            modelUrl: '/models/mug.glb',
            zones: { wrap: 'surface' },
            colorMeshes: ['body', 'inner', 'base', 'handle'],
            partLabels: { body: 'Wrap', handle: 'Handle', inner: 'Interior' },
            lighting: 'product',
            cameraDistance: 2.1,
            views: { default: { azimuth: 30, polar: 75 }, handle: { azimuth: 160, polar: 78 } },
        },
    },
    {
        slug: 'steel-water-bottle',
        name: 'Steel Water Bottle',
        categorySlug: 'drinkware',
        description: 'Double-walled 750ml stainless bottle that keeps drinks cold for 24 hours. Front and back label zones curve with the body.',
        basePrice: 19.99,
        featured: true,
        image: '/images/products/bottle.svg',
        tags: ['popular', 'eco'],
        metadata: { material: '18/8 stainless steel', careInstructions: 'Hand wash', weightGrams: 380, shippingClass: 'standard' },
        printMethods: ['uv_print', 'laser_engraving'],
        areas: [
            { key: 'front', name: 'Front', width: 300, height: 420, safeArea: { x: 25, y: 30, width: 250, height: 360 }, physicalWidthIn: 3.2, physicalHeightIn: 4.5, mockup: { left: 36, top: 38, width: 28, height: 38 }, templateImage: '/images/products/bottle.svg', sortOrder: 0 },
            { key: 'back', name: 'Back', width: 300, height: 420, safeArea: { x: 25, y: 30, width: 250, height: 360 }, physicalWidthIn: 3.2, physicalHeightIn: 4.5, mockup: { left: 36, top: 38, width: 28, height: 38 }, templateImage: '/images/products/bottle.svg', sortOrder: 1 },
        ],
        variants: [
            { name: 'Steel', color: '#c3c8cf', colorName: 'Steel', sku: 'BTL-STL-750', stock: 300 },
            { name: 'Matte Black', color: '#24262b', colorName: 'Matte Black', sku: 'BTL-BLK-750', stock: 280 },
            { name: 'Forest', color: '#1d5c40', colorName: 'Forest', sku: 'BTL-GRN-750', stock: 150 },
        ],
        model: {
            modelUrl: '/models/bottle.glb',
            zones: { front: 'surface', back: 'surface' },
            colorMeshes: ['body'],
            materials: { body: 'brushed_metal' },
            partLabels: { body: 'Body', cap: 'Cap' },
            lighting: 'product',
            cameraDistance: 2.4,
        },
    },
    {
        slug: 'travel-tumbler',
        name: 'Travel Tumbler',
        categorySlug: 'drinkware',
        description: '20oz insulated tumbler with a slide lid. A full 300° wrap zone hugs the tapered body.',
        basePrice: 22.99,
        featured: false,
        image: '/images/products/tumbler.svg',
        tags: ['new'],
        metadata: { material: 'Stainless steel, powder coat', weightGrams: 350, shippingClass: 'standard' },
        printMethods: ['uv_print', 'sublimation', 'laser_engraving'],
        areas: [
            { key: 'wrap', name: 'Wrap', width: 780, height: 400, safeArea: { x: 40, y: 30, width: 700, height: 340 }, physicalWidthIn: 8.2, physicalHeightIn: 4.2, mockup: { left: 25, top: 28, width: 50, height: 48 }, templateImage: '/images/products/tumbler.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'White', color: '#f2f1ee', colorName: 'White', sku: 'TMB-WHT', stock: 220 },
            { name: 'Black', color: '#26282c', colorName: 'Black', sku: 'TMB-BLK', stock: 260 },
            { name: 'Sage', color: '#8ba888', colorName: 'Sage', sku: 'TMB-SGE', stock: 140 },
        ],
        model: {
            modelUrl: '/models/tumbler.glb',
            zones: { wrap: 'surface' },
            colorMeshes: ['body'],
            materials: { body: 'stainless_steel' },
            partLabels: { body: 'Wrap', lid: 'Lid' },
            lighting: 'product',
            cameraDistance: 2.3,
        },
    },
    {
        slug: 'nonstick-frying-pan',
        name: 'Non-Stick Frying Pan',
        categorySlug: 'kitchen-cookware',
        description: 'A 24cm ceramic-coated pan with a customizable base — a favorite novelty gift that shows your art on the rack.',
        basePrice: 24.99,
        featured: false,
        image: '/images/products/pan.svg',
        tags: ['customizable'],
        metadata: { material: 'Aluminium, ceramic coating', weightGrams: 820, shippingClass: 'bulky' },
        printMethods: ['uv_print'],
        areas: [
            { key: 'base', name: 'Base', width: 500, height: 500, safeArea: { x: 60, y: 60, width: 380, height: 380 }, physicalWidthIn: 8, physicalHeightIn: 8, mockup: { left: 26, top: 26, width: 48, height: 48 }, templateImage: '/images/products/pan.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'Black / 24cm', color: '#26282c', colorName: 'Black', size: '24cm', sku: 'PAN-BLK-24', stock: 120 },
            { name: 'Copper / 24cm', color: '#a4682f', colorName: 'Copper', size: '24cm', sku: 'PAN-COP-24', price: 29.99, stock: 80 },
        ],
        model: {
            modelUrl: '/models/pan.glb',
            zones: { base: 'surface' },
            colorMeshes: ['body'],
            materials: { body: 'metal' },
            partLabels: { body: 'Pan', handle: 'Handle' },
            cameraDistance: 2.2,
            views: { default: { azimuth: 12, polar: 128, zoom: 1 }, base: { azimuth: 0, polar: 155, zoom: 0.95 } },
        },
    },
    {
        slug: 'ceramic-dinner-plate',
        name: 'Ceramic Dinner Plate',
        categorySlug: 'kitchen-cookware',
        description: 'A 27cm glazed plate with an edge-to-center print zone — perfect for monograms, patterns and photo gifts.',
        basePrice: 13.99,
        featured: false,
        image: '/images/products/plate.svg',
        tags: ['new'],
        metadata: { material: 'Glazed ceramic', careInstructions: 'Dishwasher safe', weightGrams: 610, shippingClass: 'fragile' },
        printMethods: ['sublimation', 'uv_print'],
        areas: [
            { key: 'center', name: 'Center', width: 520, height: 520, safeArea: { x: 55, y: 55, width: 410, height: 410 }, physicalWidthIn: 7.5, physicalHeightIn: 7.5, mockup: { left: 27, top: 27, width: 46, height: 46 }, templateImage: '/images/products/plate.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'White', color: '#f6f5f2', colorName: 'White', sku: 'PLT-WHT', stock: 300 },
            { name: 'Stone', color: '#cfc9bd', colorName: 'Stone', sku: 'PLT-STN', stock: 160 },
        ],
        model: {
            modelUrl: '/models/plate.glb',
            zones: { center: 'surface' },
            colorMeshes: ['body'],
            materials: { body: 'ceramic' },
            lighting: 'soft',
            cameraDistance: 2.1,
            views: { default: { azimuth: 8, polar: 38, zoom: 1 } },
        },
    },
    {
        slug: 'ceramic-bowl',
        name: 'Ceramic Bowl',
        categorySlug: 'kitchen-cookware',
        description: 'A generous glazed bowl with a wrap-around band print zone on the outer wall.',
        basePrice: 15.99,
        featured: false,
        image: '/images/products/bowl.svg',
        tags: ['new'],
        metadata: { material: 'Glazed ceramic', weightGrams: 520, shippingClass: 'fragile' },
        printMethods: ['sublimation', 'uv_print'],
        areas: [
            { key: 'band', name: 'Outer Band', width: 720, height: 300, safeArea: { x: 40, y: 25, width: 640, height: 250 }, physicalWidthIn: 8, physicalHeightIn: 3.3, mockup: { left: 22, top: 34, width: 56, height: 38 }, templateImage: '/images/products/bowl.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'White', color: '#f6f5f2', colorName: 'White', sku: 'BWL-WHT', stock: 240 },
            { name: 'Indigo', color: '#33507c', colorName: 'Indigo', sku: 'BWL-IND', stock: 120 },
        ],
        model: {
            modelUrl: '/models/bowl.glb',
            zones: { band: 'surface' },
            colorMeshes: ['body'],
            materials: { body: 'ceramic' },
            lighting: 'soft',
            cameraDistance: 2.1,
            views: { default: { azimuth: 18, polar: 62 } },
        },
    },
    {
        slug: 'classic-cap',
        name: 'Classic Cap',
        categorySlug: 'accessories',
        description: 'Six-panel cotton twill cap with an adjustable strap. The front-panel print conforms to the crown curve in 3D.',
        basePrice: 15.99,
        featured: false,
        image: '/images/products/cap.svg',
        tags: ['popular'],
        metadata: { material: 'Cotton twill', weightGrams: 90, shippingClass: 'standard' },
        printMethods: ['embroidery', 'dtf'],
        areas: [
            { key: 'front', name: 'Front', width: 300, height: 200, safeArea: { x: 30, y: 25, width: 240, height: 150 }, physicalWidthIn: 4.5, physicalHeightIn: 3, mockup: { left: 30, top: 34, width: 40, height: 28 }, templateImage: '/images/products/cap.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'Black', color: '#26282c', colorName: 'Black', sku: 'CAP-BLK', stock: 200 },
            { name: 'Navy', color: '#24405f', colorName: 'Navy', sku: 'CAP-NVY', stock: 180 },
            { name: 'Khaki', color: '#a89464', colorName: 'Khaki', sku: 'CAP-KHK', stock: 90 },
        ],
        model: {
            modelUrl: '/models/cap.glb',
            zones: { front: 'overlay' },
            colorMeshes: ['dome', 'visor'],
            partLabels: { dome: 'Crown', visor: 'Visor' },
            cameraDistance: 2.0,
            views: { default: { azimuth: 16, polar: 68 } },
        },
    },
    {
        slug: 'canvas-tote-bag',
        name: 'Canvas Tote Bag',
        categorySlug: 'accessories',
        description: 'A sturdy 12oz natural canvas tote with reinforced handles. Print both sides.',
        basePrice: 12.99,
        featured: true,
        image: '/images/products/tote.svg',
        tags: ['eco', 'best_seller'],
        metadata: { material: '12oz cotton canvas', weightGrams: 180, shippingClass: 'standard' },
        printMethods: ['dtg', 'screen_print'],
        areas: [
            { key: 'front', name: 'Front', width: 400, height: 420, safeArea: { x: 35, y: 35, width: 330, height: 350 }, physicalWidthIn: 11, physicalHeightIn: 11.5, mockup: { left: 28, top: 36, width: 44, height: 46 }, templateImage: '/images/products/tote.svg', sortOrder: 0 },
            { key: 'back', name: 'Back', width: 400, height: 420, safeArea: { x: 35, y: 35, width: 330, height: 350 }, physicalWidthIn: 11, physicalHeightIn: 11.5, mockup: { left: 28, top: 36, width: 44, height: 46 }, templateImage: '/images/products/tote.svg', sortOrder: 1 },
        ],
        variants: [
            { name: 'Natural', color: '#e6dcc4', colorName: 'Natural', sku: 'TOTE-NAT', stock: 400 },
            { name: 'Black', color: '#26282c', colorName: 'Black', sku: 'TOTE-BLK', stock: 250 },
        ],
        model: {
            modelUrl: '/models/tote.glb',
            zones: { front: 'overlay', back: 'overlay' },
            colorMeshes: ['body', 'bottom'],
            materials: { body: 'canvas' },
            partLabels: { body: 'Bag', handle_l: 'Handles', handle_r: 'Handles' },
            cameraDistance: 2.3,
        },
    },
    {
        slug: 'slim-phone-case',
        name: 'Slim Phone Case',
        categorySlug: 'tech-home',
        description: 'Impact-resistant slim case with edge-to-edge printing on the back plate.',
        basePrice: 16.99,
        featured: false,
        image: '/images/products/phonecase.svg',
        tags: ['popular'],
        metadata: { material: 'TPU + polycarbonate', weightGrams: 40, shippingClass: 'standard' },
        printMethods: ['uv_print', 'sublimation'],
        areas: [
            { key: 'back', name: 'Back', width: 300, height: 600, safeArea: { x: 20, y: 20, width: 260, height: 560 }, physicalWidthIn: 3, physicalHeightIn: 6, mockup: { left: 33, top: 12, width: 34, height: 76 }, templateImage: '/images/products/phonecase.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'iPhone 15', size: 'iPhone 15', color: '#26282c', colorName: 'Black', sku: 'CASE-IP15', stock: 300 },
            { name: 'iPhone 15 Pro', size: 'iPhone 15 Pro', color: '#26282c', colorName: 'Black', sku: 'CASE-IP15P', stock: 300 },
            { name: 'Galaxy S24', size: 'Galaxy S24', color: '#26282c', colorName: 'Black', sku: 'CASE-GS24', stock: 220 },
        ],
        model: {
            modelUrl: '/models/phonecase.glb',
            zones: { back: 'surface' },
            colorMeshes: ['body', 'backplate'],
            materials: { body: 'plastic_matte' },
            cameraDistance: 2.0,
            views: { default: { azimuth: 205, polar: 82 }, front: { azimuth: 180, polar: 82 }, back: { azimuth: 0, polar: 82 } },
        },
    },
    {
        slug: 'throw-pillow',
        name: 'Throw Pillow',
        categorySlug: 'home-living',
        description: 'A plush 45×45cm cushion with a full-front print zone that follows the fabric curve. Includes the insert.',
        basePrice: 18.99,
        featured: true,
        image: '/images/products/pillow.svg',
        tags: ['new', 'featured'],
        metadata: { material: 'Soft-touch polyester cover', careInstructions: 'Removable cover, machine wash', weightGrams: 420, shippingClass: 'standard' },
        printMethods: ['sublimation'],
        areas: [
            { key: 'front', name: 'Front', width: 520, height: 520, safeArea: { x: 45, y: 45, width: 430, height: 430 }, physicalWidthIn: 16, physicalHeightIn: 16, mockup: { left: 25, top: 25, width: 50, height: 50 }, templateImage: '/images/products/pillow.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'White', color: '#f3f2ef', colorName: 'White', sku: 'PIL-WHT', stock: 260 },
            { name: 'Sand', color: '#d9cdb4', colorName: 'Sand', sku: 'PIL-SND', stock: 140 },
            { name: 'Slate', color: '#5a6472', colorName: 'Slate', sku: 'PIL-SLT', stock: 120 },
        ],
        model: {
            modelUrl: '/models/pillow.glb',
            zones: { front: 'overlay' },
            colorMeshes: ['body'],
            materials: { body: 'polyester' },
            lighting: 'soft',
            cameraDistance: 2.2,
        },
    },
    {
        slug: 'desk-mouse-pad',
        name: 'Desk Mouse Pad',
        categorySlug: 'tech-home',
        description: 'A smooth-glide 30×24cm pad with a non-slip rubber base and edge-to-edge top print.',
        basePrice: 11.99,
        featured: false,
        image: '/images/products/mousepad.svg',
        tags: ['customizable'],
        metadata: { material: 'Polyester top, natural rubber base', weightGrams: 160, shippingClass: 'standard' },
        printMethods: ['sublimation'],
        areas: [
            { key: 'top', name: 'Top', width: 600, height: 480, safeArea: { x: 40, y: 40, width: 520, height: 400 }, physicalWidthIn: 11.8, physicalHeightIn: 9.4, mockup: { left: 15, top: 22, width: 70, height: 56 }, templateImage: '/images/products/mousepad.svg', sortOrder: 0 },
        ],
        variants: [{ name: 'Standard', color: '#26282c', colorName: 'Black base', sku: 'MPAD-STD', stock: 500 }],
        model: {
            modelUrl: '/models/mousepad.glb',
            zones: { top: 'surface' },
            colorMeshes: ['body', 'top', 'bottom'],
            materials: { body: 'rubber' },
            lighting: 'soft',
            cameraDistance: 2.0,
            views: { default: { azimuth: 10, polar: 42 } },
        },
    },
    {
        slug: 'hardcover-notebook',
        name: 'Hardcover Notebook',
        categorySlug: 'stationery',
        description: 'An A5 hardcover journal with 192 lined pages, an elastic band, and a printable front cover.',
        basePrice: 14.49,
        featured: false,
        image: '/images/products/notebook.svg',
        tags: ['premium', 'new'],
        metadata: { material: 'PU leather cover, 100gsm paper', weightGrams: 320, shippingClass: 'standard' },
        printMethods: ['uv_print', 'laser_engraving'],
        areas: [
            { key: 'front', name: 'Front Cover', width: 420, height: 600, safeArea: { x: 40, y: 40, width: 340, height: 520 }, physicalWidthIn: 5.8, physicalHeightIn: 8.3, mockup: { left: 26, top: 14, width: 48, height: 72 }, templateImage: '/images/products/notebook.svg', sortOrder: 0 },
        ],
        variants: [
            { name: 'Black', color: '#2b2b30', colorName: 'Black', sku: 'NB-BLK', stock: 320 },
            { name: 'Tan', color: '#a5713d', colorName: 'Tan', sku: 'NB-TAN', stock: 180 },
            { name: 'Forest', color: '#2c4a3a', colorName: 'Forest', sku: 'NB-FOR', stock: 110 },
        ],
        model: {
            modelUrl: '/models/notebook.glb',
            zones: { front: 'surface' },
            colorMeshes: ['front_cover', 'back_cover', 'spine'],
            materials: { front_cover: 'leather', back_cover: 'leather', spine: 'leather' },
            partLabels: { front_cover: 'Front cover', spine: 'Spine' },
            cameraDistance: 2.1,
            views: { default: { azimuth: 18, polar: 64 } },
        },
    },
];
async function seedProducts(categoryIds) {
    for (const p of PRODUCTS) {
        const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
        if (existing) {
            console.log(`  · ${p.name} already seeded`);
            continue;
        }
        const product = await prisma.product.create({
            data: {
                name: p.name,
                slug: p.slug,
                description: p.description,
                basePrice: new client_1.Prisma.Decimal(p.basePrice),
                featured: p.featured,
                status: 'ACTIVE',
                categoryId: categoryIds[p.categorySlug],
                tags: p.tags ? J(p.tags) : undefined,
                metadata: p.metadata ? J(p.metadata) : undefined,
                printMethods: p.printMethods ? J(p.printMethods) : undefined,
                images: { create: [{ url: p.image, alt: p.name, isPrimary: true }] },
                variants: {
                    create: p.variants.map((v) => ({
                        name: v.name,
                        color: v.color ?? null,
                        colorName: v.colorName ?? null,
                        size: v.size ?? null,
                        sku: v.sku,
                        price: v.price !== undefined ? new client_1.Prisma.Decimal(v.price) : null,
                        stock: v.stock,
                    })),
                },
                printAreas: {
                    create: p.areas.map((a) => ({
                        key: a.key,
                        name: a.name,
                        width: a.width,
                        height: a.height,
                        safeArea: J(a.safeArea),
                        physicalWidthIn: a.physicalWidthIn !== undefined ? new client_1.Prisma.Decimal(a.physicalWidthIn) : null,
                        physicalHeightIn: a.physicalHeightIn !== undefined ? new client_1.Prisma.Decimal(a.physicalHeightIn) : null,
                        mockup: a.mockup ? J({ rotate: 0, ...a.mockup }) : undefined,
                        templateImage: a.templateImage ?? null,
                        modelMeshName: `zone_${a.key}`,
                        sortOrder: a.sortOrder,
                    })),
                },
                model: {
                    create: {
                        modelType: 'GLTF',
                        modelUrl: p.model.modelUrl,
                        configuration: J(modelConfig(p)),
                    },
                },
            },
        });
        console.log(`  ✓ ${product.name}`);
    }
    console.log('✓ Products');
}
async function seedTemplates() {
    const count = await prisma.designTemplate.count();
    if (count > 0) {
        console.log('✓ Templates already seeded');
        return;
    }
    const canvas = { width: 450, height: 550 };
    const base = {
        rotation: 0, opacity: 1, locked: false, visible: true, flipX: false, flipY: false,
        shadow: null,
    };
    const text = (extra) => ({
        ...base, type: 'text', fontFamily: 'Inter', fontSize: 40, fontWeight: 700, fontStyle: 'normal',
        underline: false, uppercase: false, letterSpacing: 0, lineHeight: 1.2, align: 'center',
        fill: '#111111', stroke: '', strokeWidth: 0, width: 370, curve: 0,
        ...extra,
    });
    const shape = (extra) => ({
        ...base, type: 'shape', shape: 'rect', width: 100, height: 100, fill: '#2563eb', stroke: '',
        strokeWidth: 0, cornerRadius: 0, sides: 5, points: 5, innerRadiusRatio: 0.5,
        ...extra,
    });
    const templates = [
        {
            name: 'Bold Statement', category: 'Quotes',
            templateJson: { canvas, elements: [
                    text({ id: 'tpl-1', text: 'MAKE IT\nHAPPEN', fontFamily: 'Oswald', fontSize: 64, letterSpacing: 2, lineHeight: 1.1, x: 40, y: 160 }),
                    shape({ id: 'tpl-2', width: 220, height: 6, fill: '#e11d48', cornerRadius: 3, x: 115, y: 330 }),
                ] },
        },
        {
            name: 'Minimal Monogram', category: 'Minimal',
            templateJson: { canvas, elements: [
                    shape({ id: 'tpl-1', shape: 'circle', width: 200, height: 200, fill: '', stroke: '#111111', strokeWidth: 4, x: 125, y: 130 }),
                    text({ id: 'tpl-2', text: 'A', fontFamily: 'Playfair Display', fontSize: 110, x: 125, y: 175, width: 200 }),
                ] },
        },
        {
            name: 'Team Jersey', category: 'Sports',
            templateJson: { canvas, elements: [
                    text({ id: 'tpl-1', text: 'TITANS', fontFamily: 'Oswald', fontSize: 58, letterSpacing: 6, fill: '#1e3a5f', x: 40, y: 120 }),
                    text({ id: 'tpl-2', text: '07', fontFamily: 'Oswald', fontSize: 150, fill: '#b91c1c', lineHeight: 1, x: 40, y: 210 }),
                ] },
        },
        {
            name: 'Birthday Star', category: 'Birthday',
            templateJson: { canvas, elements: [
                    shape({ id: 'tpl-1', shape: 'star', width: 160, height: 160, fill: '#f59e0b', x: 145, y: 90 }),
                    text({ id: 'tpl-2', text: 'BIRTHDAY\nLEGEND', fontSize: 44, fontWeight: 800, letterSpacing: 1, lineHeight: 1.15, x: 40, y: 280 }),
                ] },
        },
        {
            name: 'Startup Tee', category: 'Business',
            templateJson: { canvas, elements: [
                    shape({ id: 'tpl-1', width: 130, height: 130, fill: '#2563eb', cornerRadius: 28, x: 160, y: 110 }),
                    text({ id: 'tpl-2', text: 'ACME', fontSize: 40, fontWeight: 800, letterSpacing: 8, fill: '#ffffff', width: 130, x: 160, y: 152 }),
                    text({ id: 'tpl-3', text: 'BUILD  ·  SHIP  ·  REPEAT', fontSize: 20, fontWeight: 500, letterSpacing: 2, fill: '#374151', x: 40, y: 290 }),
                ] },
        },
        {
            name: 'Pixel Gamer', category: 'Gaming',
            templateJson: { canvas, elements: [
                    shape({ id: 'tpl-1', shape: 'polygon', width: 150, height: 150, fill: '#7c3aed', sides: 6, x: 150, y: 100 }),
                    text({ id: 'tpl-2', text: 'GAME ON', fontFamily: 'Oswald', fontSize: 52, letterSpacing: 4, x: 40, y: 290 }),
                ] },
        },
        {
            name: 'Coffee First', category: 'Food',
            templateJson: { canvas: { width: 800, height: 340 }, elements: [
                    text({ id: 'tpl-1', text: 'BUT FIRST, COFFEE', fontFamily: 'Playfair Display', fontSize: 62, fontStyle: 'italic', fill: '#4a2c17', width: 700, x: 50, y: 130 }),
                ] },
        },
        {
            name: 'Corporate Crest', category: 'Corporate',
            templateJson: { canvas, elements: [
                    shape({ id: 'tpl-1', shape: 'circle', width: 170, height: 170, fill: '#0f172a', stroke: '#c8a24a', strokeWidth: 5, x: 140, y: 100 }),
                    text({ id: 'tpl-2', text: 'EST. 2024', fontSize: 22, fontWeight: 600, letterSpacing: 4, fill: '#c8a24a', width: 170, x: 140, y: 172 }),
                    text({ id: 'tpl-3', text: 'NORTHWIND & CO', fontSize: 30, letterSpacing: 3, fill: '#0f172a', x: 40, y: 310 }),
                ] },
        },
        {
            name: 'Arc Athletics', category: 'Sports',
            templateJson: { canvas, elements: [
                    text({ id: 'tpl-1', text: 'CITY RUNNERS', fontFamily: 'Oswald', fontSize: 46, letterSpacing: 3, curve: 55, fill: '#1e3a5f', x: 40, y: 150 }),
                    shape({ id: 'tpl-2', shape: 'circle', width: 120, height: 120, fill: '#e11d48', x: 165, y: 250 }),
                ] },
        },
    ];
    for (const t of templates) {
        await prisma.designTemplate.create({
            data: { name: t.name, category: t.category, templateJson: J(t.templateJson), status: 'ACTIVE' },
        });
    }
    console.log('✓ Templates');
}
async function main() {
    console.log('Seeding database…');
    await seedUsers();
    const categoryIds = await seedCategories();
    await seedProducts(categoryIds);
    await seedTemplates();
    console.log('Done.');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(() => prisma.$disconnect());
//# sourceMappingURL=seed.js.map