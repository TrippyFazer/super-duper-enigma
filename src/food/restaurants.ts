/**
 * Curated chain-restaurant menu items with nutrition as published by the chains
 * (rounded; recipes change, so treat as "menu data", not lab-verified). This is a
 * verified-source fallback for when the live food database is unreachable, and
 * the first place restaurant searches look. Values: kcal, protein g, carbs g, fat g.
 */
export interface RestaurantItem {
  brand: string;
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** breakfast | lunch | dinner | snack | drink */
  meal?: "breakfast" | "lunch" | "dinner" | "snack" | "drink";
}

const r = (brand: string, name: string, serving: string, calories: number, protein: number, carbs: number, fat: number, meal?: RestaurantItem["meal"]): RestaurantItem => ({ brand, name, serving, calories, protein, carbs, fat, meal });

export const RESTAURANT_ITEMS: RestaurantItem[] = [
  // Starbucks
  r("Starbucks", "Bacon, Gouda & Egg Sandwich", "1 sandwich", 360, 19, 33, 18, "breakfast"),
  r("Starbucks", "Sausage, Cheddar & Egg Sandwich", "1 sandwich", 480, 19, 36, 29, "breakfast"),
  r("Starbucks", "Turkey Bacon, Cheddar & Egg White Sandwich", "1 sandwich", 230, 17, 28, 5, "breakfast"),
  r("Starbucks", "Spinach, Feta & Egg White Wrap", "1 wrap", 290, 20, 34, 8, "breakfast"),
  r("Starbucks", "Egg Bites, Bacon & Gruyère", "2 bites", 300, 19, 9, 20, "breakfast"),
  r("Starbucks", "Egg Bites, Egg White & Roasted Red Pepper", "2 bites", 170, 12, 11, 8, "breakfast"),
  r("Starbucks", "Impossible Breakfast Sandwich", "1 sandwich", 420, 22, 36, 22, "breakfast"),
  r("Starbucks", "Chicken, Maple Butter & Egg Sandwich", "1 sandwich", 540, 27, 54, 24, "breakfast"),
  r("Starbucks", "Blueberry Muffin", "1 muffin", 360, 6, 53, 14, "snack"),
  r("Starbucks", "Butter Croissant", "1 croissant", 260, 5, 27, 15, "snack"),
  r("Starbucks", "Chocolate Croissant", "1 croissant", 300, 5, 34, 17, "snack"),
  r("Starbucks", "Banana Walnut & Pecan Loaf", "1 slice", 410, 6, 54, 20, "snack"),
  r("Starbucks", "Protein Box, Eggs & Cheddar", "1 box", 460, 23, 40, 23, "lunch"),
  r("Starbucks", "Turkey, Provolone & Pesto on Ciabatta", "1 sandwich", 540, 25, 52, 24, "lunch"),
  r("Starbucks", "Caffè Latte, Grande (2% milk)", "16 fl oz", 190, 13, 19, 7, "drink"),
  r("Starbucks", "Caffè Latte, Grande (oat milk)", "16 fl oz", 220, 4, 32, 8, "drink"),
  r("Starbucks", "Cappuccino, Grande (2% milk)", "16 fl oz", 140, 9, 14, 5, "drink"),
  r("Starbucks", "Caramel Macchiato, Grande", "16 fl oz", 250, 10, 35, 7, "drink"),
  r("Starbucks", "Pumpkin Spice Latte, Grande", "16 fl oz", 390, 14, 52, 14, "drink"),
  r("Starbucks", "Caramel Frappuccino, Grande", "16 fl oz", 380, 5, 54, 16, "drink"),
  r("Starbucks", "Cold Brew, Grande (black)", "16 fl oz", 5, 0, 0, 0, "drink"),
  r("Starbucks", "Vanilla Sweet Cream Cold Brew, Grande", "16 fl oz", 110, 1, 14, 5, "drink"),
  r("Starbucks", "Iced Brown Sugar Oatmilk Shaken Espresso, Grande", "16 fl oz", 120, 2, 20, 3, "drink"),
  r("Starbucks", "Pike Place Roast, Grande (black)", "16 fl oz", 5, 1, 0, 0, "drink"),
  r("Starbucks", "Chai Tea Latte, Grande", "16 fl oz", 240, 8, 45, 4, "drink"),
  // McDonald's
  r("McDonald's", "Egg McMuffin", "1 sandwich", 310, 17, 30, 13, "breakfast"),
  r("McDonald's", "Sausage McMuffin with Egg", "1 sandwich", 480, 20, 30, 31, "breakfast"),
  r("McDonald's", "Bacon, Egg & Cheese Biscuit", "1 biscuit", 460, 19, 38, 26, "breakfast"),
  r("McDonald's", "Hash Browns", "1 piece", 140, 1, 18, 8, "breakfast"),
  r("McDonald's", "Hotcakes (3)", "3 hotcakes, syrup & butter", 580, 9, 101, 15, "breakfast"),
  r("McDonald's", "Hamburger", "1 burger", 250, 12, 31, 9, "lunch"),
  r("McDonald's", "Cheeseburger", "1 burger", 300, 15, 32, 13, "lunch"),
  r("McDonald's", "Double Cheeseburger", "1 burger", 450, 25, 34, 24, "lunch"),
  r("McDonald's", "Quarter Pounder with Cheese", "1 burger", 520, 30, 42, 26, "lunch"),
  r("McDonald's", "Double Quarter Pounder with Cheese", "1 burger", 740, 48, 43, 42, "lunch"),
  r("McDonald's", "Big Mac", "1 burger", 590, 25, 46, 34, "lunch"),
  r("McDonald's", "McChicken", "1 sandwich", 400, 14, 39, 21, "lunch"),
  r("McDonald's", "Crispy Chicken Sandwich", "1 sandwich", 470, 26, 46, 20, "lunch"),
  r("McDonald's", "Chicken McNuggets (10 pc)", "10 pieces", 410, 23, 25, 24, "lunch"),
  r("McDonald's", "Chicken McNuggets (6 pc)", "6 pieces", 250, 14, 15, 15, "lunch"),
  r("McDonald's", "Filet-O-Fish", "1 sandwich", 390, 16, 39, 19, "lunch"),
  r("McDonald's", "French Fries, Medium", "1 medium", 320, 5, 43, 15, "snack"),
  r("McDonald's", "French Fries, Large", "1 large", 480, 7, 65, 23, "snack"),
  r("McDonald's", "McFlurry with Oreo, Regular", "1 regular", 510, 12, 80, 16, "snack"),
  r("McDonald's", "Vanilla Cone", "1 cone", 200, 5, 33, 5, "snack"),
  r("McDonald's", "Coca-Cola, Medium", "21 fl oz", 200, 0, 55, 0, "drink"),
  // Chipotle
  r("Chipotle", "Chicken Burrito Bowl (rice, black beans, salsa, cheese)", "1 bowl", 745, 48, 73, 26, "lunch"),
  r("Chipotle", "Chicken Burrito Bowl with Guac (rice, beans, salsa, guac)", "1 bowl", 860, 46, 81, 36, "lunch"),
  r("Chipotle", "Steak Burrito Bowl (rice, black beans, salsa, cheese)", "1 bowl", 715, 40, 72, 25, "lunch"),
  r("Chipotle", "Chicken Burrito (rice, beans, salsa, cheese, sour cream)", "1 burrito", 1130, 56, 112, 44, "lunch"),
  r("Chipotle", "Chicken Salad (lettuce, chicken, fajita veg, salsa, cheese)", "1 salad", 420, 42, 20, 20, "lunch"),
  r("Chipotle", "Carnitas Bowl (rice, pinto beans, salsa)", "1 bowl", 690, 37, 75, 25, "lunch"),
  r("Chipotle", "Sofritas Bowl (rice, black beans, salsa, guac)", "1 bowl", 760, 24, 93, 33, "lunch"),
  r("Chipotle", "Chicken Tacos (3, soft, salsa, cheese)", "3 tacos", 600, 42, 48, 25, "lunch"),
  r("Chipotle", "Chips & Guacamole", "1 side", 770, 9, 71, 51, "snack"),
  r("Chipotle", "Chips & Queso Blanco", "1 side", 780, 15, 73, 48, "snack"),
  r("Chipotle", "Chicken (one serving)", "4 oz", 180, 32, 0, 7, "lunch"),
  r("Chipotle", "Cilantro-Lime White Rice", "4 oz", 210, 4, 40, 4, "lunch"),
  r("Chipotle", "Black Beans", "4 oz", 130, 8, 22, 2, "lunch"),
  r("Chipotle", "Guacamole", "4 oz", 230, 2, 8, 22, "lunch"),
  // Panera
  r("Panera", "Bacon, Egg & Cheese on Brioche", "1 sandwich", 440, 25, 35, 22, "breakfast"),
  r("Panera", "Avocado, Egg White & Spinach on Sprouted Grain", "1 sandwich", 350, 19, 39, 14, "breakfast"),
  r("Panera", "Steel Cut Oatmeal with Strawberries & Pecans", "1 bowl", 360, 8, 55, 14, "breakfast"),
  r("Panera", "Chipotle Chicken Avocado Melt", "1 sandwich", 820, 42, 68, 42, "lunch"),
  r("Panera", "Turkey Sandwich on Country Rustic Sourdough", "1 sandwich", 560, 30, 60, 22, "lunch"),
  r("Panera", "Broccoli Cheddar Soup", "1 cup", 240, 9, 15, 16, "lunch"),
  r("Panera", "Broccoli Cheddar Soup, Bread Bowl", "1 bread bowl", 850, 31, 123, 24, "lunch"),
  r("Panera", "Mac & Cheese", "1 cup", 480, 18, 46, 24, "lunch"),
  r("Panera", "Fuji Apple Chicken Salad", "1 whole", 570, 34, 42, 30, "lunch"),
  r("Panera", "Greek Salad with Chicken", "1 whole", 470, 32, 14, 32, "lunch"),
  r("Panera", "Caesar Salad with Chicken", "1 whole", 450, 32, 24, 25, "lunch"),
  r("Panera", "Kitchen Sink Cookie", "1 cookie", 800, 9, 108, 39, "snack"),
  r("Panera", "Cinnamon Crunch Bagel", "1 bagel", 420, 11, 76, 8, "breakfast"),
  r("Panera", "Plain Bagel with Cream Cheese", "1 bagel, 2 Tbsp", 400, 12, 59, 12, "breakfast"),
  // Chick-fil-A
  r("Chick-fil-A", "Chicken Sandwich", "1 sandwich", 420, 29, 41, 17, "lunch"),
  r("Chick-fil-A", "Deluxe Chicken Sandwich", "1 sandwich", 490, 32, 43, 22, "lunch"),
  r("Chick-fil-A", "Spicy Chicken Sandwich", "1 sandwich", 450, 29, 44, 19, "lunch"),
  r("Chick-fil-A", "Grilled Chicken Sandwich", "1 sandwich", 390, 28, 44, 12, "lunch"),
  r("Chick-fil-A", "Nuggets (8 ct)", "8 pieces", 250, 27, 11, 11, "lunch"),
  r("Chick-fil-A", "Nuggets (12 ct)", "12 pieces", 380, 40, 16, 17, "lunch"),
  r("Chick-fil-A", "Grilled Nuggets (8 ct)", "8 pieces", 130, 25, 1, 3, "lunch"),
  r("Chick-fil-A", "Waffle Potato Fries, Medium", "1 medium", 420, 5, 45, 24, "snack"),
  r("Chick-fil-A", "Cobb Salad with Grilled Chicken", "1 salad, no dressing", 400, 40, 23, 17, "lunch"),
  r("Chick-fil-A", "Chicken Biscuit", "1 biscuit", 460, 19, 45, 23, "breakfast"),
  r("Chick-fil-A", "Egg White Grill", "1 sandwich", 300, 26, 31, 8, "breakfast"),
  r("Chick-fil-A", "Hash Brown Scramble Bowl with Chicken", "1 bowl", 470, 29, 20, 31, "breakfast"),
  r("Chick-fil-A", "Milkshake, Cookies & Cream", "1 regular", 630, 14, 92, 23, "snack"),
  r("Chick-fil-A", "Lemonade, Medium", "1 medium", 220, 0, 58, 0, "drink"),
  // Subway (6-inch)
  r("Subway", "Turkey Breast, 6-inch", "6-inch on Italian", 270, 18, 40, 4, "lunch"),
  r("Subway", "Oven Roasted Turkey & Ham, 6-inch", "6-inch", 300, 20, 41, 5, "lunch"),
  r("Subway", "Italian B.M.T., 6-inch", "6-inch", 390, 19, 42, 16, "lunch"),
  r("Subway", "Meatball Marinara, 6-inch", "6-inch", 480, 20, 56, 18, "lunch"),
  r("Subway", "Chicken & Bacon Ranch, 6-inch", "6-inch", 530, 36, 42, 25, "lunch"),
  r("Subway", "Rotisserie-Style Chicken, 6-inch", "6-inch", 350, 26, 41, 8, "lunch"),
  r("Subway", "Steak & Cheese, 6-inch", "6-inch", 340, 24, 41, 10, "lunch"),
  r("Subway", "Tuna, 6-inch", "6-inch", 450, 19, 40, 24, "lunch"),
  r("Subway", "Veggie Delite, 6-inch", "6-inch", 200, 8, 39, 2, "lunch"),
  r("Subway", "Chocolate Chip Cookie", "1 cookie", 210, 2, 30, 10, "snack"),
  // Taco Bell
  r("Taco Bell", "Crunchy Taco", "1 taco", 170, 8, 13, 10, "lunch"),
  r("Taco Bell", "Soft Taco, Beef", "1 taco", 180, 9, 17, 9, "lunch"),
  r("Taco Bell", "Chicken Soft Taco", "1 taco", 160, 12, 16, 5, "lunch"),
  r("Taco Bell", "Bean Burrito", "1 burrito", 350, 13, 54, 9, "lunch"),
  r("Taco Bell", "Burrito Supreme, Beef", "1 burrito", 390, 16, 49, 14, "lunch"),
  r("Taco Bell", "Crunchwrap Supreme", "1 crunchwrap", 530, 16, 70, 21, "lunch"),
  r("Taco Bell", "Chicken Quesadilla", "1 quesadilla", 510, 27, 37, 27, "lunch"),
  r("Taco Bell", "Cheesy Gordita Crunch", "1 gordita", 500, 20, 41, 28, "lunch"),
  r("Taco Bell", "Power Menu Bowl, Chicken", "1 bowl", 460, 26, 50, 18, "lunch"),
  r("Taco Bell", "Nachos BellGrande", "1 order", 740, 16, 82, 38, "snack"),
  // Wendy's
  r("Wendy's", "Dave's Single", "1 burger", 590, 30, 39, 34, "lunch"),
  r("Wendy's", "Jr. Bacon Cheeseburger", "1 burger", 380, 19, 26, 23, "lunch"),
  r("Wendy's", "Baconator", "1 burger", 960, 57, 40, 65, "lunch"),
  r("Wendy's", "Grilled Chicken Sandwich", "1 sandwich", 350, 33, 36, 9, "lunch"),
  r("Wendy's", "Spicy Chicken Sandwich", "1 sandwich", 500, 29, 50, 20, "lunch"),
  r("Wendy's", "Chili, Large", "1 large", 340, 23, 33, 15, "lunch"),
  r("Wendy's", "Baked Potato, Plain", "1 potato", 270, 7, 61, 0, "lunch"),
  r("Wendy's", "Apple Pecan Chicken Salad, Full", "1 salad", 550, 37, 36, 29, "lunch"),
  r("Wendy's", "French Fries, Medium", "1 medium", 350, 5, 45, 16, "snack"),
  r("Wendy's", "Frosty, Chocolate, Small", "1 small", 350, 9, 57, 9, "snack"),
  // Five Guys
  r("Five Guys", "Hamburger", "1 burger (2 patties)", 700, 39, 39, 43, "lunch"),
  r("Five Guys", "Cheeseburger", "1 burger (2 patties)", 840, 47, 40, 55, "lunch"),
  r("Five Guys", "Little Cheeseburger", "1 burger (1 patty)", 550, 30, 40, 32, "lunch"),
  r("Five Guys", "Bacon Cheeseburger", "1 burger", 920, 51, 40, 62, "lunch"),
  r("Five Guys", "Fries, Little", "1 little", 530, 8, 72, 23, "snack"),
  r("Five Guys", "Fries, Regular", "1 regular", 950, 15, 131, 41, "snack"),
  // Sweetgreen
  r("Sweetgreen", "Harvest Bowl", "1 bowl", 705, 30, 76, 32, "lunch"),
  r("Sweetgreen", "Kale Caesar", "1 salad", 530, 31, 23, 34, "lunch"),
  r("Sweetgreen", "Chicken Pesto Parm", "1 bowl", 630, 43, 51, 29, "lunch"),
  r("Sweetgreen", "Crispy Rice Bowl", "1 bowl", 655, 33, 63, 29, "lunch"),
  r("Sweetgreen", "Guacamole Greens", "1 salad", 545, 29, 29, 36, "lunch"),
  // Dunkin'
  r("Dunkin'", "Sausage, Egg & Cheese on Croissant", "1 sandwich", 700, 26, 43, 47, "breakfast"),
  r("Dunkin'", "Bacon, Egg & Cheese on English Muffin", "1 sandwich", 370, 19, 33, 18, "breakfast"),
  r("Dunkin'", "Wake-Up Wrap, Bacon Egg & Cheese", "1 wrap", 240, 11, 15, 15, "breakfast"),
  r("Dunkin'", "Glazed Donut", "1 donut", 240, 3, 31, 11, "snack"),
  r("Dunkin'", "Boston Kreme Donut", "1 donut", 270, 3, 37, 11, "snack"),
  r("Dunkin'", "Everything Bagel with Cream Cheese", "1 bagel", 460, 14, 61, 17, "breakfast"),
  r("Dunkin'", "Hash Browns", "6 pieces", 130, 1, 16, 7, "breakfast"),
  r("Dunkin'", "Iced Coffee with Cream & Sugar, Medium", "24 fl oz", 180, 2, 28, 7, "drink"),
  r("Dunkin'", "Iced Latte, Medium (whole milk)", "24 fl oz", 180, 9, 15, 9, "drink"),
  // Panda Express
  r("Panda Express", "Orange Chicken", "1 serving (5.7 oz)", 490, 25, 51, 23, "dinner"),
  r("Panda Express", "Grilled Teriyaki Chicken", "1 serving", 275, 33, 14, 10, "dinner"),
  r("Panda Express", "Kung Pao Chicken", "1 serving", 290, 16, 14, 19, "dinner"),
  r("Panda Express", "Beijing Beef", "1 serving", 470, 13, 56, 26, "dinner"),
  r("Panda Express", "Broccoli Beef", "1 serving", 150, 9, 13, 7, "dinner"),
  r("Panda Express", "Fried Rice", "1 serving", 520, 11, 85, 16, "dinner"),
  r("Panda Express", "Chow Mein", "1 serving", 510, 13, 80, 20, "dinner"),
  r("Panda Express", "White Steamed Rice", "1 serving", 380, 7, 87, 0, "dinner"),
  r("Panda Express", "Super Greens", "1 serving", 90, 6, 10, 3, "dinner"),
  r("Panda Express", "Plate: Orange Chicken + Grilled Teriyaki Chicken + Chow Mein", "1 plate", 1275, 71, 145, 53, "dinner"),
  // Qdoba / Jimmy John's / In-N-Out / Shake Shack
  r("Qdoba", "Chicken Burrito Bowl (rice, black beans, salsa, cheese, guac)", "1 bowl", 830, 45, 80, 37, "lunch"),
  r("Jimmy John's", "Turkey Tom", "8-inch", 510, 27, 50, 23, "lunch"),
  r("Jimmy John's", "Italian Night Club", "8-inch", 880, 41, 52, 55, "lunch"),
  r("Jimmy John's", "Beach Club", "8-inch", 650, 35, 54, 33, "lunch"),
  r("In-N-Out", "Double-Double", "1 burger", 670, 37, 39, 41, "lunch"),
  r("In-N-Out", "Cheeseburger", "1 burger", 480, 22, 39, 27, "lunch"),
  r("In-N-Out", "Hamburger", "1 burger", 390, 16, 39, 19, "lunch"),
  r("In-N-Out", "Protein Style Double-Double", "1 burger (lettuce wrap)", 520, 33, 11, 39, "lunch"),
  r("In-N-Out", "French Fries", "1 order", 370, 6, 50, 15, "snack"),
  r("Shake Shack", "ShackBurger, Single", "1 burger", 530, 29, 24, 32, "lunch"),
  r("Shake Shack", "Chicken Shack", "1 sandwich", 590, 36, 50, 26, "lunch"),
  r("Shake Shack", "Fries", "1 regular", 470, 6, 63, 21, "snack"),
  // Generic restaurant staples (typical values; labelled as menu estimates in the UI)
  r("Pizza", "Cheese Pizza, Large Slice (1/8 of 14\")", "1 slice", 290, 12, 34, 11, "dinner"),
  r("Pizza", "Pepperoni Pizza, Large Slice", "1 slice", 320, 13, 34, 14, "dinner"),
  r("Sushi", "California Roll", "8 pieces", 300, 9, 45, 8, "dinner"),
  r("Sushi", "Salmon Nigiri", "2 pieces", 120, 8, 14, 3, "dinner"),
  r("Sushi", "Spicy Tuna Roll", "8 pieces", 290, 15, 36, 9, "dinner"),
  r("Diner", "Two Eggs, Bacon, Hash Browns & Toast", "1 plate", 820, 30, 70, 46, "breakfast"),
  r("Diner", "Pancakes (3) with Syrup & Butter", "1 plate", 680, 12, 108, 21, "breakfast"),
  r("Diner", "Club Sandwich with Fries", "1 plate", 1020, 40, 90, 54, "lunch"),
  r("Thai", "Pad Thai with Chicken", "1 entrée", 840, 32, 100, 32, "dinner"),
  r("Thai", "Green Curry with Chicken & Rice", "1 entrée", 750, 30, 70, 38, "dinner"),
  r("Indian", "Chicken Tikka Masala with Rice", "1 entrée", 900, 45, 80, 42, "dinner"),
  r("Indian", "Garlic Naan", "1 piece", 300, 9, 45, 9, "dinner"),
  r("Italian", "Spaghetti Bolognese", "1 entrée", 760, 35, 90, 26, "dinner"),
  r("Italian", "Fettuccine Alfredo", "1 entrée", 1100, 32, 95, 65, "dinner"),
  r("Steakhouse", "Sirloin Steak (8 oz) with Baked Potato", "1 plate", 760, 60, 50, 32, "dinner"),
  r("Bar", "Chicken Wings (10) with Blue Cheese", "10 wings", 1050, 60, 10, 85, "dinner"),
  r("Bar", "Cheeseburger with Fries", "1 plate", 1150, 45, 95, 62, "dinner"),
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Simple ranked search: every query token must match brand or name. */
export function searchRestaurantItems(query: string, limit = 12): RestaurantItem[] {
  const toks = norm(query).split(" ").filter((t) => t.length > 1);
  if (!toks.length) return [];
  const scored = RESTAURANT_ITEMS.map((it) => {
    const hay = norm(`${it.brand} ${it.name}`);
    let score = 0;
    for (const t of toks) {
      if (!hay.includes(t)) return null;
      score += norm(it.brand).includes(t) ? 3 : 1;
      if (hay.startsWith(t)) score += 1;
    }
    return { it, score };
  })
    .filter((x): x is { it: RestaurantItem; score: number } => !!x)
    .sort((a, b) => b.score - a.score || a.it.calories - b.it.calories);
  return scored.slice(0, limit).map((x) => x.it);
}

export const RESTAURANT_BRANDS = [...new Set(RESTAURANT_ITEMS.map((i) => i.brand))];
