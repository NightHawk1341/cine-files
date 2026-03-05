import { config } from './config';

interface TributeProduct {
  id: number;
  name: string;
  price: number;
  imageUrl: string;
  url: string;
}

const MOCK_PRODUCTS: TributeProduct[] = [
  {
    id: 1,
    name: 'Фигурка — Тестовый продукт',
    price: 2999,
    imageUrl: '/icons/placeholder.svg',
    url: 'https://buy-tribute.com/products/1',
  },
];

export async function fetchTributeProducts(ids: number[]): Promise<TributeProduct[]> {
  if (config.isDev) {
    return MOCK_PRODUCTS.filter((p) => ids.includes(p.id));
  }

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/products/by-ids?ids=${ids.join(',')}`,
      {
        headers: {
          'X-API-Key': config.tribute.apiKey,
        },
        next: { revalidate: 3600 },
      }
    );

    if (!response.ok) return [];
    return response.json();
  } catch {
    return [];
  }
}

export async function checkTributeUser(
  provider: string,
  providerId: string
): Promise<number | null> {
  if (config.isDev) return null;

  try {
    const response = await fetch(
      `${config.tribute.apiUrl}/users/by-provider?provider=${provider}&id=${providerId}`,
      {
        headers: {
          'X-API-Key': config.tribute.apiKey,
        },
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data.id ?? null;
  } catch {
    return null;
  }
}
