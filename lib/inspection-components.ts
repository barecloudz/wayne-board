import { InspectionComponent } from "./inspection-types";

export const INSPECTION_COMPONENTS: InspectionComponent[] = [
  {
    id: 1,
    name: "Lighting",
    regulation: "FMCSR § 393.9 / FMCSR § 393.11(a)(1) / FMCSR § 393.25",
    description:
      "All required lights and reflectors must be present and operable at all times. If a rear license plate is present, the vehicle must have a working license plate light. Tractors only: Check 7-way connection for turn signals, brake lights, marker lights, continuous (AUX) primary power.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 2,
    name: "Horn",
    regulation: "FMCSR § 393.81",
    description: "Must be operational.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 3,
    name: "Windshield Area, Wipers and Washing System",
    regulation: "FMCSR § 393.60 (b), (c) / FMCSR § 393.78 (a)",
    description:
      "Each windshield should be free of damage. Windshield wipers must be working condition, and the vehicle must have an operable windshield washing system with fluid that will wash the windshield.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 4,
    name: "Verify Periodic Inspection",
    regulation: "FMCSR § 396.17(c) / FMCSR § 396.23 (b)(1)",
    description:
      "A decal or inspection report must be valid and must be on or in the vehicle.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 5,
    name: "Fire Extinguisher",
    regulation: "FMCSR § 393.95 (a)(3), (4)",
    description:
      "Must be securely mounted and charged. At a minimum, UL rating must be 5 B:C or higher.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 6,
    name: "3 Warning Triangles",
    regulation: "FMCSR § 393.95 / FMVSS No. 125, § 571.125 / Equipment Terms",
    description: "Must be present and secured.",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 7,
    name: "Seat/Tether Belt",
    regulation: "FMVSS No. 209, § 571.209",
    description:
      "Seat belt is operating properly (including jump seat, if applicable).",
    requiresAccess: true,
    affectsSafety: true,
  },
  {
    id: 8,
    name: "Tire Tread Depth/Tire Damage",
    regulation: "FMCSR § 393.75",
    description:
      'Steer tires must have at least 4/32" tread depth and non-steering (rear/trailer) tires at least 2/32" tread depth when measured at any point on a major tread groove. Leaks, sidewall damage, etc. are non-compliant.',
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 9,
    name: "Wheels & Rims",
    regulation: "FMCSR § 393.205",
    description:
      "Free from cracks; no missing or loose nuts or broken studs.",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 10,
    name: "Fluid Leaks - Oil, Grease, and/or Brakes",
    regulation: "FMCSR § 396.5(b) / FMCSR Appendix G1. J (6)",
    description:
      "Any visible leak is non-compliant. Check vehicle and surrounding area to assist with identifying leaks.",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 11,
    name: "Antifreeze",
    regulation: "FMCSR § 396.3 (1)",
    description:
      "Vehicle should be free from leaks. Typical color green, orange or purple.",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 12,
    name: "Fuel System",
    regulation: "FMCSR Appendix G: 4(a), (b)",
    description:
      "Any visible fuel leak is non-compliant. A missing fuel filler cap is non-compliant. Electric Vehicles, mark N/A.",
    requiresAccess: false,
    affectsSafety: true,
    evNotApplicable: true,
  },
  {
    id: 13,
    name: "Rear Vision Mirrors",
    regulation: "FMCSR § 393.80 / FMVSS No. 111, (49 CFR 571.111)",
    description:
      "Driver and passenger side mirrors are present and secured. FMSCA-approved camera monitoring systems may be installed in lieu of two rear-vision mirrors. *System must be operational.",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 14,
    name: "Hood Latch",
    regulation: "FMCSR § 393.203(c)",
    description:
      "If hood latches are not visible, mark N/A. If visible, hood latches are present, and hood is secured.",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 15,
    name: "Required Markings",
    regulation: "FMCSR § 390.21(b) / West's Ann.Cal.Vehicle Code § 34507.5",
    description:
      "Vehicle Unit Number, USDOT 86876 and 'Operated by Federal Express Corporation' directly above the US DOT: All vehicles must have a unit number. All vehicles domiciled in CA must display the US DOT, regardless of weight. The US DOT and Operated By markings are required if the GVWR is greater than 10,000 lbs. (looking for lack of required markings only.)",
    requiresAccess: false,
    affectsSafety: true,
  },
  {
    id: 16,
    name: "Emergency Response Guidebook",
    regulation: "49 CFR 172.602",
    description:
      "Is present and is the current version (no more than 5 years from the date on the cover).",
    requiresAccess: true,
    affectsSafety: false,
  },
  {
    id: 17,
    name: "Hazardous Materials Envelope",
    regulation: "49 CFR 172.602",
    description:
      "OP-901 is present. Straight Trucks and Vans Only; mark N/A for tractors.",
    requiresAccess: true,
    affectsSafety: false,
    vansOnly: true,
  },
  {
    id: 18,
    name: "Electronic Logging Device (ELD) Information",
    regulation: "FMCSR 395.22(h)",
    description:
      "All tractors must have an ELD, and the following ELD information in the cab and available for law enforcement upon request: (1) user's manual; (2) instruction sheet with step-by-step instructions to produce and transfer hours-of-service records to law enforcement; (3) instruction sheet describing ELD malfunction reporting requirements; and (4) supply of blank paper logs. If not a tractor, mark N/A.",
    requiresAccess: true,
    affectsSafety: false,
    tractorOnly: true,
  },
  {
    id: 19,
    name: "Conspicuity Tape",
    regulation: "FMCSR § 393.11 / FMVSS 571.108 S5.7.1.4.3",
    description:
      "Vehicle has the required tape or reflective devices. If not a tractor, mark N/A.",
    requiresAccess: false,
    affectsSafety: true,
    tractorOnly: true,
  },
  {
    id: 20,
    name: "Crossmember, Pintle Hook and Safety Loops",
    regulation: "FMCSR § 393.70",
    description:
      "If not a tractor, mark N/A. Crossmember: Inspect for any cracks, loose fittings, or missing fasteners. Pintle hook: Free from excessive vertical/lateral movement. Safety loops: Securely attached to the crossmember so that the chains can provide secondary securement to support the dolly.",
    requiresAccess: false,
    affectsSafety: true,
    tractorOnly: true,
  },
];
