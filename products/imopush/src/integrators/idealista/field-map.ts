/**
 * Idealista ↔ canonical field mappings.
 * Discovered by exploring /flow/novo-anuncio via CDP.
 * Update this file as each new form step is explored.
 *
 * Form URL:   https://www.idealista.pt/flow/novo-anuncio
 * Steps:      1 = Dados básicos | 2 = Detalhes | 3 = Fotos
 */

import type {
  PropertyType,
  OperationType,
  RentDuration,
  ContactMethod,
  UnifiedAddress,
  UnifiedProperty,
} from "../../types/unified-property";

// ─── Step 1: typology ────────────────────────────────────────────────────────
// Field: <select name="typology" id="ca-select-typology">
// Trigger button: <button id="qa_typology">
// Selection: click trigger → click li[data-value="VALUE"]

export const IDEALISTA_TYPOLOGY: Record<PropertyType, string> = {
  apartment:      "HOME",
  house:          "CHALET",
  country_house:  "COUNTRYHOUSE",
  room:           "ROOM",
  office:         "OFFICE",
  commercial:     "WAREHOUSE",
  garage:         "GARAGE",
  land:           "LAND",
  storage:        "STORAGEROOM",
  building:       "BUILDING",
  vacation_rental:"VACATIONAL",
};

// ─── Step 1: operation ───────────────────────────────────────────────────────
// Field: <input type="radio" name="operation" id="ca-radio-sell|ca-radio-rent">
// Note: span overlay — must use element.click() via evaluate(), not Playwright check()

export const IDEALISTA_OPERATION: Record<OperationType, { id: string; value: string }> = {
  sale: { id: "ca-radio-sell", value: "SALE" },
  rent: { id: "ca-radio-rent", value: "RENT" },
};

// ─── Step 1: rentType ────────────────────────────────────────────────────────
// Shown only when operation = rent
// Field: <input type="radio" name="rentType" id="long-term|mid-term|short-term">

export const IDEALISTA_RENT_DURATION: Record<RentDuration, string> = {
  long_term:  "long-term",
  mid_term:   "mid-term",
  short_term: "short-term",
};

// ─── Step 1: address.floorNumber ─────────────────────────────────────────────
// Field: <select name="address.floorNumber" id="ca-select-floor">
// Trigger button: <button id="qa_address.floorNumber">

export const IDEALISTA_FLOOR: Record<string, string> = {
  basement_2:    "-2",  // Por debaixo do R/C (-2)
  basement_1:    "-1",  // Por debaixo do R/C (-1)
  basement:      "st",  // Cave
  basement_light:"ss",  // Cave com luz
  ground:        "bj",  // Rés do chão
  // 1–60: numeric strings map directly "1" → "1", "2" → "2", …
};

// ─── Step 1: door type ───────────────────────────────────────────────────────
// Field: <select id="sDoorSelector"> (backed by hidden input address.door)

export const IDEALISTA_DOOR_TYPE: Record<string, string> = {
  letter:            "letters", // A, B, C…
  number:            "numbers", // 1, 2, 3…
  unique:            "pu",      // Porta única
  left:              "iz",      // Esquerdo
  right:             "dr",      // Direito
  exterior:          "ex",
  exterior_left:     "ei",
  exterior_right:    "ed",
  interior:          "in",
  interior_left:     "ii",
  interior_right:    "id",
  center:            "cr",
  center_left:       "ci",
  center_right:      "cd",
};

// ─── Step 1: contact method ──────────────────────────────────────────────────
// Field: <input type="radio" name="preferredContactMethodId">

export const IDEALISTA_CONTACT_METHOD: Record<ContactMethod, string> = {
  phone_and_chat: "all-radio-button",
  chat_only:      "only-chat-radio-button",
  phone_only:     "only-phone-radio-button",
};

// ─── Step 1: field IDs reference ─────────────────────────────────────────────

export const IDEALISTA_FIELDS_STEP1 = {
  typologyTrigger:    "qa_typology",
  typologySelect:     "ca-select-typology",
  operationSell:      "ca-radio-sell",
  operationRent:      "ca-radio-rent",
  rentTypeLong:       "long-term",
  rentTypeMid:        "mid-term",
  rentTypeShort:      "short-term",
  locality:           "ca-geo-locality",
  street:             "ca-geo-address",
  streetNumber:       "ca-geo-number",
  kmNumber:           "ca-geo-km",
  radioNum:           "ca-radio-num",
  radioKm:            "ca-radio-km",
  verifyAddress:      "ca-geo-validate",
  floorTrigger:       "qa_address.floorNumber",
  floorSelect:        "ca-select-floor",
  isTopFloor:         "ca-top-floor",
  doorTypeSelect:     "sDoorSelector",
  doorNumberSelect:   "doorNumberSelector",
  doorLetterSelect:   "doorLetterSelector",
  block:              "ca-block",
  buildingName:       "ca-building-name",
  email:              "ca-login-email",
  emailConfirm:       "ca-login-repeat-email",
  phone1:             "ca-contact-phone1",
  phone2:             "ca-contact-phone2",
  name:               "ca-contact-name",
  contactPhone:       "all-radio-button",
  contactChat:        "only-chat-radio-button",
  contactPhoneOnly:   "only-phone-radio-button",
  privacyPolicy:      "privacyPolicyAccepted1",
  submitStep1:        "ca-button-continue",
} as const;

// ─── Step 2: Detalhes ────────────────────────────────────────────────────────
// URL state: execution=eXs4 (after cost-notice dismissal at s3)
// Intermediate pages before Detalhes:
//   s3 → "Este anúncio terá um custo" — single submit "Ok, entendido" (no id)
//   (phone-conflict page at s3 with #ca-radio-continue if same phone was used elsewhere)
//
// All required fields for apartment (HOME) + sale:
//   constructedArea, builtType, roomNumber, bathNumber, hasLift,
//   currentOccupationType, ad.price, (energeticClass is soft-required)

export const IDEALISTA_FIELDS_STEP2 = {
  // ── Apartment sub-type checkboxes (optional, pick 0 or more) ──
  isRegularFlat:      "isRegularFlat1",    // standard flat
  isPenthouse:        "isPenthouse1",
  isDuplex:           "isDuplex1",
  isStudio:           "checkstudio",

  // ── Condition (required radio) ──
  builtTypeGood:      "builtTypeId-good",    // good / new condition
  builtTypeRestore:   "builtTypeId-restore", // needs renovation

  // ── Areas ──
  constructedArea:    "constructedArea",     // name="constructedArea" type=tel
  usableArea:         "usableArea",          // name="usableArea" type=tel

  // ── Rooms + baths ──
  roomNumber:         "roomNumber",          // name="roomNumber" type=tel
  bathNumber:         "bathNumber",          // name="bathNumber" type=tel

  // ── Flat location (exterior/interior) ──
  flatLocationExt:    "location-external",
  flatLocationInt:    "location-internal",

  // ── Lift (required radio) ──
  hasLiftYes:         "hasLift1",
  hasLiftNo:          "hasLift2",

  // ── Energy certificate (custom dropdown) ──
  // Trigger: #qa_portugalEnergeticClass → li[data-value]
  // Values: "unknown"|"a+"|"a"|"b"|"b-"|"c"|"d"|"e"|"f"|"g"|"in-process"|"exempt"
  energyCertTrigger:  "qa_portugalEnergeticClass",
  energyCertSelect:   "portugalEnergeticClass",   // name="portugalEnergeticClass"

  // ── Orientation checkboxes (optional) ──
  north:  "hasNorthOrientation1",
  south:  "hasSouthOrientation1",
  east:   "hasEastOrientation1",
  west:   "hasWestOrientation1",

  // ── Features (optional checkboxes) ──
  hasWardrobe:          "hasWardrobe1",
  hasAirConditioning:   "hasAirConditioning1",
  hasTerrace:           "hasTerrace1",
  hasBalcony:           "hasBalcony1",
  hasBoxRoom:           "hasBoxRoom1",        // storage/boxroom
  hasParkingSpace:      "checkboxspace",
  hasSwimmingPool:      "hasSwimmingPool1",
  hasGarden:            "hasGarden",
  hasHandicapAccess:    "hasHandicapAdaptedAccess1",
  hasHandicapUse:       "hasHandicapAdaptedUse1",

  // ── Parking (conditional on hasParkingSpace) ──
  parkingInPriceNull:   "ca-parking-in-price-null",
  parkingInPrice:       "ca-parking-in-price",
  parkingNotInPrice:    "ca-parking-not-in-price",
  parkingPrice:         "ca-parking-price",      // name="parkingSpacePrice"

  // ── Construction year (optional) ──
  constructionYear:     "constructionYear",

  // ── Heating (custom dropdowns) ──
  // heatingType: INDIVIDUAL | CENTRAL | NO_HEATING
  heatingTypeTrigger:       "qa_heatingType",
  heatingTypeSelect:        "heating",              // name="heatingType"
  individualHeatTrigger:    "qa_individualHeatingType",
  individualHeatSelect:     "individualHeatingType", // GAS|PROPANE_BUTANE|ELECTRIC|AIR_CONDITIONING_HEAT_PUMP|OTHER
  centralHeatTrigger:       "qa_centralHeatingType",
  centralHeatSelect:        "centralHeatingType",   // GAS|FUEL_OIL|OTHER

  // ── Price (required) ──
  price:             "ca-price",             // name="ad.price" type=tel
  communityCosts:    "ca-community-cost",    // name="communityCosts" type=tel (optional)

  // ── Occupancy (required radio) ──
  occupancyTenanted: "currentOccupationType1",  // value="TENANTED"
  occupancyVacant:   "currentOccupationType2",  // value=? (check with dumpForm)

  // ── Description (optional textarea) ──
  description:       "websiteComment.propertyComment",

  // ── Submit ── (no id; find by value containing "Continuar")
} as const;

// ─── Step 2: occupancy values ─────────────────────────────────────────────────
export const IDEALISTA_OCCUPANCY = {
  tenanted: "TENANTED",  // occupied by tenant
  // vacant value TBD — check by selecting currentOccupationType2 and reading .value
} as const;

// ─── Step 2: energy certificate ──────────────────────────────────────────────
export const IDEALISTA_ENERGY_CLASS: Record<string, string> = {
  "A+":       "a+",
  "A":        "a",
  "B":        "b",
  "B-":       "b-",
  "C":        "c",
  "D":        "d",
  "E":        "e",
  "F":        "f",
  "G":        "g",
  "unknown":  "unknown",  // not yet available
  "pending":  "in-process",
  "exempt":   "exempt",
};

// ─── Step 2: heating types ────────────────────────────────────────────────────
export const IDEALISTA_HEATING_TYPE = {
  individual: "INDIVIDUAL",
  central:    "CENTRAL",
  none:       "NO_HEATING",
} as const;

export const IDEALISTA_INDIVIDUAL_HEAT = {
  gas:              "GAS",
  propane_butane:   "PROPANE_BUTANE",
  electric:         "ELECTRIC",
  heat_pump:        "AIR_CONDITIONING_HEAT_PUMP",
  other:            "OTHER",
} as const;

export const IDEALISTA_CENTRAL_HEAT = {
  gas:      "GAS",
  fuel_oil: "FUEL_OIL",
  other:    "OTHER",
} as const;

// ─── Step 3: Fotos ───────────────────────────────────────────────────────────
// URL state: execution=eXs7
// Single <input type="file"> (no name/id) for photo/video upload
// Buttons (no ids):
//   "Adicionar fotos e vídeos" — opens file picker
//   "Continuar sem fotos"      — advance without photos (does NOT publish)
//   "Voltar"                   — back to step 2
//
// Submitting "Continuar sem fotos" (or uploading photos and submitting) PUBLISHES the listing.

export const IDEALISTA_FIELDS_STEP3 = {
  photoInput:         "input[type=file]",            // no name or id
  submitWithPhotos:   "Adicionar fotos e vídeos",    // button text (no id)
  submitWithoutPhotos:"Continuar sem fotos",          // button text (no id)
  back:               "Voltar",
} as const;

// ─── Canonical → Idealista translators ───────────────────────────────────────

export function toIdealistaStep1(p: UnifiedProperty) {
  return {
    typology:           IDEALISTA_TYPOLOGY[p.type],
    operation:          IDEALISTA_OPERATION[p.operation].value,
    rentType:           p.rentDuration ? IDEALISTA_RENT_DURATION[p.rentDuration] : undefined,
    locality:           p.address.locality,
    street:             p.address.street,
    streetNumber:       p.address.streetNumber,
    floor:              p.address.floor ? (IDEALISTA_FLOOR[p.address.floor] ?? p.address.floor) : undefined,
    hideAddress:        p.address.hideAddress ?? false,
    block:              p.address.block,
    buildingName:       p.address.buildingName,
    email:              p.contact.email,
    phone1:             p.contact.phone,
    phone1Prefix:       p.contact.phone ? (p.contact.phonePrefix ?? "351") : undefined,
    phone2:             p.contact.phone2,
    phone2Prefix:       p.contact.phone2 ? (p.contact.phone2Prefix ?? "351") : undefined,
    name:               p.contact.name,
    contactMethod:      p.contact.preferredMethod
                          ? IDEALISTA_CONTACT_METHOD[p.contact.preferredMethod]
                          : IDEALISTA_CONTACT_METHOD.phone_and_chat,
  };
}

export function toIdealistaStep2(p: UnifiedProperty) {
  const f = p.features ?? {};
  const cond = f.condition ?? "good";

  // Energy: canonical "A+" → idealista "a+"
  const energy = f.energyCertificate
    ? (IDEALISTA_ENERGY_CLASS[f.energyCertificate] ?? "unknown")
    : "unknown";

  // Heating
  const heatingType = f.heatingType ? IDEALISTA_HEATING_TYPE[f.heatingType] : undefined;
  const individualHeat = f.individualHeatFuel
    ? IDEALISTA_INDIVIDUAL_HEAT[f.individualHeatFuel]
    : undefined;
  const centralHeat = f.centralHeatFuel
    ? IDEALISTA_CENTRAL_HEAT[f.centralHeatFuel]
    : undefined;

  // Occupancy: canonical → Idealista radio id
  const occupancyId =
    p.occupancy === "tenanted" ? IDEALISTA_FIELDS_STEP2.occupancyTenanted :
    p.occupancy === "vacant"   ? IDEALISTA_FIELDS_STEP2.occupancyVacant :
    IDEALISTA_FIELDS_STEP2.occupancyVacant; // default vacant

  return {
    builtTypeId:        cond === "needs_renovation" ? "builtTypeId-restore" : "builtTypeId-good",
    constructedArea:    String(f.constructedAreaSqm ?? p.sizeSqm ?? ""),
    usableArea:         f.usableAreaSqm ? String(f.usableAreaSqm) : undefined,
    roomNumber:         p.rooms != null ? String(p.rooms) : undefined,
    bathNumber:         p.bathrooms != null ? String(p.bathrooms) : undefined,
    hasLiftId:          f.hasLift ? "hasLift1" : "hasLift2",
    energyCertValue:    energy,
    price:              String(Math.round((p.priceCents ?? 0) / 100)),
    communityCosts:     p.communityFeeCents ? String(Math.round(p.communityFeeCents / 100)) : undefined,
    occupancyId,
    constructionYear:   f.yearBuilt ? String(f.yearBuilt) : undefined,
    heatingType,
    individualHeat,
    centralHeat,
    description:        p.description,
    // checkboxes
    hasTerrace:         f.hasTerrace ?? false,
    hasBalcony:         f.hasBalcony ?? false,
    hasGarden:          f.hasGarden ?? false,
    hasPool:            f.hasPool ?? false,
    hasParking:         f.hasParking ?? false,
    parkingInPrice:     f.parkingIncludedInPrice ?? false,
    parkingPrice:       f.parkingPriceCents ? String(Math.round(f.parkingPriceCents / 100)) : undefined,
    hasStorage:         f.hasStorage ?? false,
    hasWardrobe:        f.hasWardrobe ?? false,
    hasAirConditioning: f.hasAirConditioning ?? false,
    hasHandicapAccess:  f.hasHandicapAccess ?? false,
    facesNorth:         f.facesNorth ?? false,
    facesSouth:         f.facesSouth ?? false,
    facesEast:          f.facesEast ?? false,
    facesWest:          f.facesWest ?? false,
  };
}
