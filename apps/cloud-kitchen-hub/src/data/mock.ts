// Mock data for Cloud Kitchen Hub MVP

export type OrderStatus = 'Draft' | 'Recipe Parsing' | 'Ready For Dispatch' | 'Dispatched' | 'Completed'

export interface Order {
  id: string
  customer: string
  deliveryDate: string
  quantity: number
  menuContent: string
  status: OrderStatus
  createdAt: string
}

export interface RecipeItem {
  code: string
  name: string
  type: '主菜' | '配菜' | '調味料'
  ingredients: { name: string; grams: number }[]
  equipment: string
  laborMinutes: number
  cookingMethod: string
  historyStatus: 'Complete' | 'Missing'
}

export interface DispatchItem {
  id: string
  dishCode: string
  dishName: string
  quantity: number
  suggestedBranch: string
  ingredientCheck: 'normal' | 'warning' | 'error'
  historyCheck: 'normal' | 'warning' | 'error'
  capacityCheck: 'normal' | 'warning' | 'error'
}

export interface WorkOrder {
  id: string
  dispatchId: string
  branch: string
  items: { dishName: string; quantity: number }[]
  status: 'Pending' | 'In Progress' | 'Completed'
  createdAt: string
}

export interface Branch {
  id: string
  name: string
  capacity: number
  equipment: string[]
}

export const ORDERS: Order[] = [
  { id: 'ORD-001', customer: '台積電員工餐廳', deliveryDate: '2026-06-15', quantity: 500, menuContent: '香煎鯖魚便當、炸豬排便當', status: 'Ready For Dispatch', createdAt: '2026-06-12 08:30' },
  { id: 'ORD-002', customer: '聯發科技股份有限公司', deliveryDate: '2026-06-15', quantity: 300, menuContent: '宮保雞丁便當', status: 'Dispatched', createdAt: '2026-06-12 09:00' },
  { id: 'ORD-003', customer: '緯創資通股份有限公司', deliveryDate: '2026-06-16', quantity: 200, menuContent: '三杯豬便當、滷肉飯', status: 'Recipe Parsing', createdAt: '2026-06-12 10:15' },
  { id: 'ORD-004', customer: '友達光電股份有限公司', deliveryDate: '2026-06-16', quantity: 150, menuContent: '紅燒牛腩便當', status: 'Draft', createdAt: '2026-06-12 11:00' },
  { id: 'ORD-005', customer: '台灣大哥大股份有限公司', deliveryDate: '2026-06-14', quantity: 400, menuContent: '糖醋排骨便當、炒青菜', status: 'Completed', createdAt: '2026-06-11 14:00' },
]

export const RECIPES: RecipeItem[] = [
  {
    code: '香煎鯖魚01', name: '香煎鯖魚', type: '主菜',
    ingredients: [{ name: '鯖魚片', grams: 180 }, { name: '鹽', grams: 5 }, { name: '橄欖油', grams: 10 }],
    equipment: '平底鍋', laborMinutes: 15, cookingMethod: '煎', historyStatus: 'Complete',
  },
  {
    code: '高麗菜03', name: '炒高麗菜', type: '配菜',
    ingredients: [{ name: '高麗菜', grams: 120 }, { name: '蒜頭', grams: 8 }, { name: '鹽', grams: 3 }],
    equipment: '炒鍋', laborMinutes: 8, cookingMethod: '炒', historyStatus: 'Complete',
  },
  {
    code: '玉米炒蛋02', name: '玉米炒蛋', type: '配菜',
    ingredients: [{ name: '玉米粒', grams: 80 }, { name: '雞蛋', grams: 100 }, { name: '鹽', grams: 2 }],
    equipment: '炒鍋', laborMinutes: 6, cookingMethod: '炒', historyStatus: 'Missing',
  },
  {
    code: '炸豬排02', name: '炸豬排', type: '主菜',
    ingredients: [{ name: '豬里肌', grams: 200 }, { name: '麵包粉', grams: 30 }, { name: '雞蛋', grams: 50 }],
    equipment: '油炸鍋', laborMinutes: 20, cookingMethod: '炸', historyStatus: 'Complete',
  },
]

export const DISPATCH_ITEMS: DispatchItem[] = [
  { id: 'D-001', dishCode: '香煎鯖魚01', dishName: '香煎鯖魚', quantity: 500, suggestedBranch: '台中店', ingredientCheck: 'normal', historyCheck: 'normal', capacityCheck: 'normal' },
  { id: 'D-002', dishCode: '炸豬排02', dishName: '炸豬排', quantity: 300, suggestedBranch: '台北店', ingredientCheck: 'warning', historyCheck: 'normal', capacityCheck: 'normal' },
  { id: 'D-003', dishCode: '高麗菜03', dishName: '炒高麗菜', quantity: 500, suggestedBranch: '台中店', ingredientCheck: 'normal', historyCheck: 'normal', capacityCheck: 'warning' },
  { id: 'D-004', dishCode: '玉米炒蛋02', dishName: '玉米炒蛋', quantity: 300, suggestedBranch: '台北店', ingredientCheck: 'error', historyCheck: 'error', capacityCheck: 'normal' },
]

export const WORK_ORDERS: WorkOrder[] = [
  {
    id: 'WO-001', dispatchId: 'DISPATCH-20260615-001', branch: '台中店',
    items: [{ dishName: '香煎鯖魚', quantity: 500 }, { dishName: '炒高麗菜', quantity: 500 }],
    status: 'In Progress', createdAt: '2026-06-12 14:30',
  },
  {
    id: 'WO-002', dispatchId: 'DISPATCH-20260615-001', branch: '台北店',
    items: [{ dishName: '炸豬排', quantity: 300 }, { dishName: '玉米炒蛋', quantity: 300 }],
    status: 'Pending', createdAt: '2026-06-12 14:30',
  },
]

export const BRANCHES: Branch[] = [
  { id: 'taichung', name: '台中店', capacity: 800, equipment: ['平底鍋', '炒鍋', '油炸鍋', '蒸爐'] },
  { id: 'taipei', name: '台北店', capacity: 600, equipment: ['平底鍋', '炒鍋', '油炸鍋'] },
  { id: 'kaohsiung', name: '高雄店', capacity: 500, equipment: ['平底鍋', '炒鍋'] },
]

export const DASHBOARD_STATS = {
  todayOrders: 4,
  pendingDispatch: 2,
  dispatched: 1,
  completed: 1,
  missingHistory: 2,
  dispatchAnomalies: 1,
  branchWorkOrders: [
    { branch: '台中店', count: 1, quantity: 1000 },
    { branch: '台北店', count: 1, quantity: 600 },
    { branch: '高雄店', count: 0, quantity: 0 },
  ],
}
