export type ItemType = 'hotel' | 'activity' | 'eating';

export interface TripItem {
  id: string;
  type: ItemType;
  name: string;
  notes: string;
  link: string;
  role: string;
  cost: number;
  chosen: boolean;
  date?: string;
  time?: string;
  location?: string;
}

export interface TripConfig {
  startDate?: string;
  endDate?: string;
  budget?: string;
  location?: string;
}
