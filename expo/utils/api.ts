const BASE_URL = 'https://api.lorcana-api.com';

export interface LorcanaApiCard {
  Artist: string;
  Set_Name: string;
  Classifications: string;
  Date_Added: string;
  Set_Num: number;
  Color: string;
  Gamemode: string;
  Franchise: string;
  Image: string;
  Cost: number;
  Inkable: boolean;
  Name: string;
  Type: string;
  Lore: number;
  Rarity: string;
  Flavor_Text: string;
  Unique_ID: string;
  Card_Num: number;
  Body_Text: string;
  Willpower: number;
  Date_Modified: string;
  Strength: number;
  Set_ID: string;
  Move_Cost?: number;
}

export async function fetchAllCards(): Promise<LorcanaApiCard[]> {
  console.log('[API] Fetching all cards from lorcana-api.com...');
  const response = await fetch(`${BASE_URL}/bulk/cards`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  const data: LorcanaApiCard[] = await response.json();
  console.log(`[API] Fetched ${data.length} cards`);
  return data;
}

export async function searchCards(query: string): Promise<LorcanaApiCard[]> {
  console.log(`[API] Searching cards: ${query}`);
  const encoded = encodeURIComponent(query);
  const response = await fetch(`${BASE_URL}/cards/fetch?search=${encoded}&pagesize=50`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  const data: LorcanaApiCard[] = await response.json();
  console.log(`[API] Search returned ${data.length} cards`);
  return data;
}
