/**
 * FreshTrack — Built-in Recipe Bank
 *
 * Pure data file. Defines a global RECIPES array consumed by app.js.
 * Each recipe has: name, description, ingredients (array), instructions (array),
 * and `main` — the real main ingredient(s) this recipe rescues, as singular
 * lowercase food names (e.g. 'banana', 'chicken'). Matching uses `main` first;
 * the category keywords below are only a fallback ("Also try") signal and are
 * never shown to the user as ingredients.
 *
 * Ingredients may contain food item names (e.g., "spinach") or category keywords
 * (e.g., "fresh produce", "dairy products", "meat", "pantry staples", "bakery item")
 * so that recipe matching works by both item name and category.
 */
const RECIPES = [
  {
    name: 'Banana Bread',
    category: 'Snack',
    main: ['banana'],
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
    category: 'Dinner',
    main: ['spinach'],
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
    category: 'Breakfast',
    main: ['egg'],
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
    category: 'Dinner',
    main: ['chicken'],
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
    category: 'Dinner',
    main: ['tomato'],
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
    category: 'Lunch',
    main: ['cheese', 'bread'],
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
    category: 'Dinner',
    main: ['rice'],
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
    category: 'Breakfast',
    main: ['yogurt', 'banana'],
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
    category: 'Snack',
    main: ['bread'],
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
    category: 'Breakfast',
    main: ['milk'],
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
  },
  {
    name: 'Overnight Oats',
    category: 'Breakfast',
    main: ['oat'],
    description: 'No-cook breakfast that uses up oats and milk before they go bad.',
    ingredients: [
      'oats',
      'milk',
      'yogurt',
      'honey',
      'fruit',
      'vanilla extract',
      'dairy products',
      'pantry staples',
      'fresh produce'
    ],
    instructions: [
      'Combine 1/2 cup oats with 1/2 cup milk and 1/4 cup yogurt in a jar.',
      'Add 1 tbsp honey and 1/2 tsp vanilla extract.',
      'Stir well, cover, and refrigerate overnight.',
      'In the morning, top with fresh fruit and enjoy cold.'
    ]
  },
  {
    name: 'Cheese Omelette',
    category: 'Breakfast',
    main: ['egg', 'cheese'],
    description: 'Simple omelette to rescue eggs and cheese nearing their date.',
    ingredients: [
      'eggs',
      'cheese',
      'milk',
      'butter',
      'salt',
      'pepper',
      'dairy products'
    ],
    instructions: [
      'Whisk 3 eggs with 1 tbsp milk, salt, and pepper.',
      'Melt 1 tbsp butter in a non-stick pan over medium-low heat.',
      'Pour in eggs and let set slightly, then lift edges to let raw egg flow underneath.',
      'Sprinkle grated cheese on one half.',
      'Fold the other half over and cook 1 minute more.',
      'Slide onto a plate and serve hot.'
    ]
  },
  {
    name: 'Potato Hash',
    category: 'Breakfast',
    main: ['potato'],
    description: 'Hearty hash that turns soft potatoes and onions into a crispy meal.',
    ingredients: [
      'potatoes',
      'onion',
      'bell pepper',
      'olive oil',
      'salt',
      'pepper',
      'paprika',
      'garlic powder',
      'fresh produce',
      'pantry staples'
    ],
    instructions: [
      'Dice 3 potatoes and 1 onion into small cubes.',
      'Heat 3 tbsp olive oil in a large skillet over medium-high heat.',
      'Add potatoes and cook 10 minutes, stirring occasionally.',
      'Add diced onion and bell pepper, cook 5 more minutes.',
      'Season with salt, pepper, paprika, and garlic powder.',
      'Press down and crisp for 2 minutes, then serve hot.'
    ]
  },
  {
    name: 'Apple Crumble',
    category: 'Snack',
    main: ['apple'],
    description: 'Warm dessert that rescues soft, bruised apples with a crunchy oat topping.',
    ingredients: [
      'apples',
      'oats',
      'butter',
      'sugar',
      'cinnamon',
      'flour',
      'fresh produce',
      'pantry staples'
    ],
    instructions: [
      'Preheat oven to 350°F (175°C).',
      'Peel and slice 4 apples, then toss with 2 tbsp sugar and 1 tsp cinnamon.',
      'Spread apples in a baking dish.',
      'Mix 1 cup oats, 1/2 cup flour, 1/2 cup sugar, and 1/4 cup melted butter.',
      'Sprinkle topping over apples.',
      'Bake 35 minutes until golden and bubbly.',
      'Serve warm with ice cream or yogurt.'
    ]
  },
  {
    name: 'Tomato Bruschetta',
    category: 'Snack',
    main: ['tomato', 'bread'],
    description: 'Fresh topping for stale bread that rescues ripe tomatoes.',
    ingredients: [
      'tomatoes',
      'bread',
      'garlic',
      'olive oil',
      'basil',
      'salt',
      'pepper',
      'fresh produce',
      'bakery item'
    ],
    instructions: [
      'Dice 4 ripe tomatoes and place in a bowl.',
      'Mince 2 cloves garlic and a handful of fresh basil.',
      'Toss with 2 tbsp olive oil, salt, and pepper.',
      'Slice stale bread and toast until golden.',
      'Rub each slice with a cut garlic clove.',
      'Spoon tomato mixture on top and serve immediately.'
    ]
  },
  {
    name: 'Garlic Herb Butter Pasta',
    category: 'Dinner',
    main: ['pasta'],
    description: 'Rich pasta that uses up fresh herbs and butter in a quick sauce.',
    ingredients: [
      'pasta',
      'butter',
      'garlic',
      'herbs',
      'parmesan',
      'olive oil',
      'salt',
      'pepper',
      'pantry staples',
      'dairy products',
      'fresh produce'
    ],
    instructions: [
      'Cook 8 oz pasta according to package directions, reserving 1/2 cup pasta water.',
      'Melt 4 tbsp butter with 1 tbsp olive oil in a large pan.',
      'Add 4 minced garlic cloves and cook 1 minute.',
      'Toss in 2 cups chopped fresh herbs (basil, parsley, or chives).',
      'Add cooked pasta and toss with splashes of pasta water to loosen the sauce.',
      'Stir in grated parmesan, season with salt and pepper, and serve.'
    ]
  },
  {
    name: 'Chicken Stir Fry',
    category: 'Dinner',
    main: ['chicken'],
    description: 'Quick stir fry that saves chicken and rice before they go to waste.',
    ingredients: [
      'chicken',
      'rice',
      'vegetables',
      'soy sauce',
      'garlic',
      'ginger',
      'sesame oil',
      'cornstarch',
      'meat',
      'pantry staples',
      'fresh produce'
    ],
    instructions: [
      'Slice chicken into thin strips and toss with 1 tbsp cornstarch.',
      'Heat 2 tbsp sesame oil in a wok over high heat.',
      'Add chicken and stir fry until golden, 4 to 5 minutes. Set aside.',
      'Add minced garlic and ginger, cook 30 seconds.',
      'Add diced vegetables and stir fry 3 minutes.',
      'Return chicken to wok, add 3 tbsp soy sauce, and toss.',
      'Serve over cooked rice.'
    ]
  },
  {
    name: 'Shakshuka',
    category: 'Lunch',
    main: ['tomato', 'egg'],
    description: 'Eggs poached in spiced tomato sauce, perfect for soft tomatoes and eggs.',
    ingredients: [
      'tomatoes',
      'eggs',
      'onion',
      'garlic',
      'bell pepper',
      'cumin',
      'paprika',
      'olive oil',
      'salt',
      'pepper',
      'fresh produce'
    ],
    instructions: [
      'Heat 2 tbsp olive oil in a skillet over medium heat.',
      'Dice 1 onion and 1 bell pepper, saute 5 minutes.',
      'Add 2 minced garlic cloves, 1 tsp cumin, and 1 tsp paprika.',
      'Pour in 1 can crushed tomatoes or 6 fresh chopped tomatoes.',
      'Simmer 10 minutes until thick.',
      'Make 4 wells in the sauce and crack an egg into each.',
      'Cover and cook 5 minutes until whites set but yolks are soft.',
      'Season with salt and pepper, and serve with bread.'
    ]
  },
  {
    name: 'Cheesy Baked Potatoes',
    category: 'Dinner',
    main: ['potato', 'cheese'],
    description: 'Loaded baked potatoes that rescue cheese and milk before they spoil.',
    ingredients: [
      'potatoes',
      'cheese',
      'butter',
      'milk',
      'salt',
      'pepper',
      'chives',
      'bacon bits',
      'fresh produce',
      'dairy products'
    ],
    instructions: [
      'Preheat oven to 400°F (200°C).',
      'Scrub 4 potatoes and pierce with a fork.',
      'Bake directly on the rack for 45 to 50 minutes until tender.',
      'Slice open and fluff the flesh with a fork.',
      'Add 1 tbsp butter and a splash of milk to each, then mash lightly.',
      'Top with grated cheese and return to oven 5 minutes until melted.',
      'Garnish with chopped chives and bacon bits. Serve hot.'
    ]
  },
  {
    name: 'Banana Smoothie',
    category: 'Breakfast',
    main: ['banana'],
    description: 'Quick blended smoothie for overripe bananas and yogurt on their last day.',
    ingredients: [
      'banana',
      'yogurt',
      'milk',
      'honey',
      'vanilla extract',
      'ice',
    ],
    instructions: [
      'Peel 2 overripe bananas and break into chunks.',
      'Add to a blender with 1 cup yogurt, 1/2 cup milk, and 1 tbsp honey.',
      'Add 1/2 tsp vanilla extract and a handful of ice.',
      'Blend until smooth and creamy.',
      'Pour into a glass and drink immediately.'
    ]
  },
  {
    name: 'Carrot Ginger Soup',
    category: 'Lunch',
    main: ['carrot'],
    description: 'Warm spiced soup that rescues carrots and fresh ginger before they wilt.',
    ingredients: [
      'carrots',
      'ginger',
      'onion',
      'garlic',
      'vegetable stock',
      'cream',
      'olive oil',
      'salt',
      'pepper',
      'fresh produce'
    ],
    instructions: [
      'Heat 1 tbsp olive oil in a large pot over medium heat.',
      'Dice 1 onion and saute 4 minutes until soft.',
      'Add 3 minced garlic cloves and 1 tbsp grated fresh ginger, cook 1 minute.',
      'Add 6 chopped carrots and 4 cups vegetable stock.',
      'Bring to a boil, then simmer 20 minutes until carrots are tender.',
      'Blend until smooth, then stir in 1/2 cup cream.',
      'Season with salt and pepper and serve hot.'
    ]
  },
  {
    name: 'Bread Pudding',
    category: 'Snack',
    main: ['bread', 'milk'],
    description: 'Sweet baked pudding that turns stale bread and milk into dessert.',
    ingredients: [
      'bread',
      'milk',
      'eggs',
      'sugar',
      'butter',
      'cinnamon',
      'vanilla extract',
      'raisins',
      'dairy products'
    ],
    instructions: [
      'Preheat oven to 350°F (175°C) and butter a baking dish.',
      'Tear 6 slices of stale bread into chunks and place in the dish.',
      'Whisk 2 cups milk, 3 eggs, 1/2 cup sugar, 1 tsp cinnamon, and 1 tsp vanilla.',
      'Pour the mixture over the bread and press down so it soaks.',
      'Sprinkle 1/4 cup raisins on top and dot with butter.',
      'Bake 35 to 40 minutes until golden and set.',
      'Serve warm, with cream if you have it.'
    ]
  },
  {
    name: 'Yogurt Herb Dip',
    category: 'Snack',
    main: ['yogurt'],
    description: 'Cool herby dip for yogurt on its last day, served with bread or vegetables.',
    ingredients: [
      'yogurt',
      'garlic',
      'lemon',
      'dill',
      'parsley',
      'olive oil',
      'salt',
      'pepper',
      'cucumber',
      'bread',
      'fresh produce',
      'dairy products'
    ],
    instructions: [
      'Mince 1 garlic clove and chop a handful of dill and parsley.',
      'Stir into 1 cup yogurt with 1 tbsp lemon juice and 1 tbsp olive oil.',
      'Season with salt and pepper.',
      'Chill 15 minutes so the flavors blend.',
      'Serve with sliced cucumber and toasted bread.'
    ]
  },
  {
    name: 'Creamy Mushroom Pasta',
    category: 'Dinner',
    main: ['mushroom', 'pasta'],
    description: 'Rich creamy pasta that rescues mushrooms, cream, and garlic together.',
    ingredients: [
      'pasta',
      'mushrooms',
      'cream',
      'garlic',
      'butter',
      'parmesan',
      'parsley',
      'salt',
      'pepper',
      'fresh produce',
      'dairy products'
    ],
    instructions: [
      'Cook 250 g pasta in salted water until al dente, then drain.',
      'Melt 2 tbsp butter in a large pan over medium-high heat.',
      'Slice 300 g mushrooms and fry 6 minutes until golden.',
      'Add 3 minced garlic cloves and cook 1 minute more.',
      'Pour in 1 cup cream and simmer 3 minutes until slightly thick.',
      'Toss in the pasta with grated parmesan and chopped parsley.',
      'Season with salt and pepper and serve immediately.'
    ]
  },
  {
    name: 'French Toast',
    category: 'Breakfast',
    main: ['bread', 'egg'],
    description: 'Golden fried toast that rescues stale bread, eggs, and milk in minutes.',
    ingredients: [
      'bread',
      'eggs',
      'milk',
      'butter',
      'cinnamon',
      'sugar',
      'vanilla extract',
      'honey',
      'dairy products'
    ],
    instructions: [
      'Whisk 2 eggs, 1/2 cup milk, 1 tsp vanilla, and 1/2 tsp cinnamon in a bowl.',
      'Dip each slice of bread into the mixture, coating both sides.',
      'Melt 1 tbsp butter in a pan over medium heat.',
      'Fry the slices 2 to 3 minutes per side until golden brown.',
      'Dust with sugar and drizzle with honey.',
      'Serve hot with fruit if you have any.'
    ]
  }
];
