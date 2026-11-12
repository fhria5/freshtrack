/**
 * FreshTrack — Built-in Recipe Bank
 *
 * Pure data file. Defines a global RECIPES array consumed by app.js.
 * Each recipe has: name, description, ingredients (array), instructions (array).
 *
 * Ingredients may contain food item names (e.g., "spinach") or category keywords
 * (e.g., "fresh produce", "dairy products", "meat", "pantry staples", "bakery item")
 * so that recipe matching works by both item name and category.
 */
const RECIPES = [
  {
    name: 'Banana Bread',
    description: 'A classic way to rescue overripe bananas before they turn.',
    ingredients: [
      'overripe bananas',
      'flour',
      'sugar',
      'eggs',
      'butter',
      'baking soda',
      'vanilla extract',
      'pantry staples'
    ],
    instructions: [
      'Preheat oven to 350°F (175°C).',
      'Mash 3 overripe bananas in a bowl.',
      'Mix in 1/3 cup melted butter, 3/4 cup sugar, 1 egg, and 1 tsp vanilla.',
      'Add 1 tsp baking soda and a pinch of salt.',
      'Fold in 1.5 cups flour until just combined.',
      'Pour into a greased loaf pan and bake for 60 minutes.',
      'Cool before slicing. Enjoy your rescued bananas!'
    ]
  },
  {
    name: 'Sautéed Spinach',
    description: 'Quick, healthy side dish that saves wilting spinach.',
    ingredients: [
      'spinach',
      'garlic',
      'olive oil',
      'salt',
      'pepper',
      'lemon',
      'fresh produce'
    ],
    instructions: [
      'Heat 2 tbsp olive oil in a large pan over medium heat.',
      'Mince 2 cloves garlic and sauté until fragrant, about 30 seconds.',
      'Add 6 cups fresh spinach and toss until wilted, 2–3 minutes.',
      'Season with salt, pepper, and a squeeze of lemon juice.',
      'Serve immediately.'
    ]
  },
  {
    name: 'Veggie Scramble',
    description: 'A flexible breakfast that uses up eggs and any lingering vegetables.',
    ingredients: [
      'eggs',
      'cheese',
      'butter',
      'vegetables',
      'fresh produce',
      'dairy products'
    ],
    instructions: [
      'Whisk 4 eggs with a pinch of salt and pepper.',
      'Dice whatever vegetables you have — peppers, onions, tomatoes, spinach all work.',
      'Sauté vegetables in butter over medium heat until soft.',
      'Pour in eggs and stir gently until just set.',
      'Sprinkle with cheese, fold, and serve hot.'
    ]
  },
  {
    name: 'Chicken Soup',
    description: 'Comforting homemade soup perfect for chicken nearing its date.',
    ingredients: [
      'chicken',
      'carrots',
      'celery',
      'onion',
      'garlic',
      'chicken broth',
      'salt',
      'pepper',
      'thyme',
      'meat',
      'fresh produce'
    ],
    instructions: [
      'Sauté diced onion, carrots, and celery in a large pot until soft.',
      'Add 2 minced garlic cloves and cook 1 minute.',
      'Pour in 6 cups chicken broth and bring to a boil.',
      'Add chicken pieces and simmer 20 minutes until cooked through.',
      'Season with salt, pepper, and thyme.',
      'Shred chicken and serve hot.'
    ]
  },
  {
    name: 'Tomato Pasta Sauce',
    description: 'Slow-cooked sauce that rescues soft, wrinkling tomatoes.',
    ingredients: [
      'tomatoes',
      'garlic',
      'olive oil',
      'basil',
      'oregano',
      'salt',
      'sugar',
      'onion',
      'fresh produce',
      'pantry staples'
    ],
    instructions: [
      'Score and blanch 6 tomatoes, then peel and chop.',
      'Sauté diced onion and 3 minced garlic cloves in olive oil.',
      'Add tomatoes, 1 tsp salt, 1 tsp sugar, and dried oregano.',
      'Simmer 30–45 minutes, stirring occasionally.',
      'Stir in fresh basil and adjust seasoning to taste.',
      'Toss with your favorite pasta and serve.'
    ]
  },
  {
    name: 'Grilled Cheese',
    description: 'The ultimate comfort food for aging cheese and stale bread.',
    ingredients: [
      'cheese',
      'bread',
      'butter',
      'dairy products',
      'bakery item'
    ],
    instructions: [
      'Butter the outside of 2 slices of bread.',
      'Place cheese slices between the bread (buttered sides out).',
      'Cook in a pan over medium-low heat until golden, 3–4 minutes per side.',
      'Press gently for even melting.',
      'Cut and serve hot.'
    ]
  },
  {
    name: 'Fried Rice',
    description: 'Fast weeknight dinner that uses leftover rice, eggs, and veg.',
    ingredients: [
      'rice',
      'eggs',
      'vegetables',
      'soy sauce',
      'sesame oil',
      'garlic',
      'ginger',
      'green onion',
      'pantry staples',
      'fresh produce',
      'dairy products'
    ],
    instructions: [
      'Heat 1 tbsp sesame oil in a wok or large pan over high heat.',
      'Scramble 2 eggs, then set aside.',
      'Add more oil, then sauté minced garlic and ginger for 30 seconds.',
      'Add diced vegetables and stir-fry 2–3 minutes.',
      'Add 3 cups cold cooked rice and break up clumps.',
      'Pour in 2 tbsp soy sauce and toss to combine.',
      'Return eggs to the pan, add chopped green onion, and serve.'
    ]
  },
  {
    name: 'Smoothie Bowl',
    description: 'A refreshing way to use up yogurt and fruit before they spoil.',
    ingredients: [
      'yogurt',
      'fruit',
      'honey',
      'granola',
      'banana',
      'dairy products',
      'fresh produce'
    ],
    instructions: [
      'Blend 1 cup yogurt with 1 cup frozen or fresh fruit until smooth.',
      'Pour into a bowl.',
      'Top with sliced banana, granola, and a drizzle of honey.',
      'Eat immediately before it gets spooky.'
    ]
  },
  {
    name: 'Stale Bread Croutons',
    description: 'Transform stale bread into crispy croutons for salads and soups.',
    ingredients: [
      'bread',
      'olive oil',
      'garlic powder',
      'salt',
      'pepper',
      'herbs',
      'bakery item'
    ],
    instructions: [
      'Preheat oven to 375°F (190°C).',
      'Cut stale bread into 1-inch cubes.',
      'Toss with 3 tbsp olive oil, 1 tsp garlic powder, salt, pepper, and dried herbs.',
      'Spread on a baking sheet.',
      'Bake 12–15 minutes until golden and crisp, stirring once.',
      'Cool completely and store in an airtight container.'
    ]
  },
  {
    name: 'Milk Pancakes',
    description: 'Fluffy pancakes to use up milk before it sours.',
    ingredients: [
      'milk',
      'flour',
      'eggs',
      'sugar',
      'baking powder',
      'salt',
      'butter',
      'dairy products',
      'pantry staples'
    ],
    instructions: [
      'Whisk together 1.5 cups flour, 2 tbsp sugar, 2 tsp baking powder, and 1/2 tsp salt.',
      'Beat in 1.25 cups milk and 1 egg until smooth.',
      'Let batter rest 5 minutes.',
      'Heat a buttered pan over medium heat.',
      'Pour 1/4 cup batter per pancake.',
      'Cook until bubbles form, then flip and cook 1–2 minutes more.',
      'Serve with your favorite toppings.'
    ]
  }
];
