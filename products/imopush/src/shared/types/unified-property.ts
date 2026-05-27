/**
 * Canonical property representation — platform-agnostic.
 * Each integrator translates FROM this type TO the platform's own schema.
 */

// ─── Enumerations ────────────────────────────────────────────────────────────

export type PropertyType =
  | "apartment"       // flat in a building        (HOME on Idealista)
  | "house"           // detached/semi house        (CHALET)
  | "country_house"   // quinta, monte, solar       (COUNTRYHOUSE)
  | "room"            // shared housing             (ROOM)
  | "office"          // commercial office          (OFFICE)
  | "commercial"      // retail / warehouse         (WAREHOUSE)
  | "garage"          // parking space              (GARAGE)
  | "land"            // plot                       (LAND)
  | "storage"         // storage room               (STORAGEROOM)
  | "building"        // whole building             (BUILDING)
  | "vacation_rental";// short-stay                 (VACATIONAL)

export type OperationType = "sale" | "rent";

export type RentDuration = "long_term" | "mid_term" | "short_term";

export type ContactMethod = "phone_and_chat" | "chat_only" | "phone_only";

export type PropertyCondition = "new" | "good" | "needs_renovation";

export type OccupancyType = "vacant" | "tenanted" | "owner_occupied";

export type EnergyClass = "A+" | "A" | "B" | "B-" | "C" | "D" | "E" | "F" | "G" | "exempt" | "pending" | "unknown";

export type HeatingType = "individual" | "central" | "none";

export type IndividualHeatingFuel = "gas" | "propane_butane" | "electric" | "heat_pump" | "other";

export type CentralHeatingFuel = "gas" | "fuel_oil" | "other";

export type ApartmentSubtype = "regular" | "penthouse" | "duplex" | "studio";

export type FlatLocation = "exterior" | "interior";

// ─── Address ─────────────────────────────────────────────────────────────────

export interface UnifiedAddress {
  /** City / town — required for all platforms */
  locality: string;
  /** Municipality (may differ from locality for rural properties) */
  municipality?: string;
  /** District / county */
  district?: string;
  /** Parish (freguesia) */
  parish?: string;
  /** Street name */
  street?: string;
  /** Street number or km marker */
  streetNumber?: string;
  /** Floor: "ground" | "basement" | "1" … "60" | "basement_light" */
  floor?: string;
  /** Door / apartment identifier */
  door?: string;
  /** Building block */
  block?: string;
  /** Building name */
  buildingName?: string;
  /** Postal code */
  postalCode?: string;
  /** Hide exact address on listing (paid feature on some platforms) */
  hideAddress?: boolean;
  /** GPS coordinates */
  coordinates?: { lat: number; lng: number };
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export interface UnifiedContact {
  name: string;
  email: string;
  /** National number without country code (e.g. "917140356") */
  phone?: string;
  /** Country dialling code without "+" (e.g. "351"); defaults to "351" (PT) */
  phonePrefix?: string;
  phone2?: string;
  phone2Prefix?: string;
  preferredMethod?: ContactMethod;
}

// ─── Features ─────────────────────────────────────────────────────────────────

export interface PropertyFeatures {
  // ── Condition ──────────────────────────────────────────────────────────────
  condition?:          PropertyCondition;
  yearBuilt?:          number;

  // ── Energy ─────────────────────────────────────────────────────────────────
  energyCertificate?:  EnergyClass;

  // ── Heating ────────────────────────────────────────────────────────────────
  heatingType?:        HeatingType;
  individualHeatFuel?: IndividualHeatingFuel;
  centralHeatFuel?:    CentralHeatingFuel;

  // ── Spaces ─────────────────────────────────────────────────────────────────
  /** Flat sub-type (for apartments) */
  apartmentSubtype?:   ApartmentSubtype;
  /** Exterior vs interior flat position */
  flatLocation?:       FlatLocation;
  floors?:             number;       // number of floors in the building / villa
  /** Constructed (total) area in m² */
  constructedAreaSqm?: number;
  /** Usable area in m² */
  usableAreaSqm?:      number;
  /** Lot / plot size in m² */
  lotSizeSqm?:         number;
  /** Garage area in m² */
  garageAreaSqm?:      number;

  // ── Amenities ──────────────────────────────────────────────────────────────
  hasLift?:            boolean;
  hasTerrace?:         boolean;
  hasBalcony?:         boolean;
  hasGarden?:          boolean;
  hasPool?:            boolean;
  hasParking?:         boolean;
  parkingIncludedInPrice?: boolean;
  parkingPriceCents?:  number;
  hasStorage?:         boolean;
  hasWardrobe?:        boolean;
  hasAirConditioning?: boolean;
  hasFireplace?:       boolean;
  hasHandicapAccess?:  boolean;

  // ── Orientation ────────────────────────────────────────────────────────────
  facesNorth?: boolean;
  facesSouth?: boolean;
  facesEast?:  boolean;
  facesWest?:  boolean;
}

// ─── Property ────────────────────────────────────────────────────────────────

export interface UnifiedProperty {
  /** Internal reference (from source platform, CRM, etc.) */
  reference?: string;

  type:        PropertyType;
  operation:   OperationType;
  /** Only when operation === "rent" */
  rentDuration?: RentDuration;

  address:     UnifiedAddress;
  contact:     UnifiedContact;

  // ── Financials ─────────────────────────────────────────────────────────────
  /** Asking price in EUR cents */
  priceCents:  number;
  /** Monthly community costs in EUR cents (condominiums) */
  communityFeeCents?: number;

  // ── Core dimensions ────────────────────────────────────────────────────────
  /** Main area in m² (maps to constructedArea on Idealista step 2) */
  sizeSqm?:    number;
  rooms?:      number;
  bathrooms?:  number;

  // ── Occupancy ──────────────────────────────────────────────────────────────
  occupancy?:  OccupancyType;

  // ── Content ────────────────────────────────────────────────────────────────
  description?: string;
  features?:    PropertyFeatures;

  /** Public URLs of photos/videos (in order) */
  photoUrls?:   string[];

  /** Source URL this was scraped / imported from */
  sourceUrl?:   string;
}
