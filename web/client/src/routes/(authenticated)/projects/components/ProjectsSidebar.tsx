// TODO: FAKE DATA
const projects = [
  {
    active: true,
    budget: '$2,967',
    date: '10.05.2025',
    name: "Dean's Office Allocation",
  },
  {
    active: false,
    budget: '$268',
    date: '10.05.2025',
    name: 'Summer Research Program',
  },
  {
    active: false,
    budget: '$138.87',
    date: '10.05.2025',
    name: 'Summer Research Program',
  },
  {
    active: false,
    budget: '$929.23',
    date: '10.05.2025',
    name: 'USDA Africa Biotechnol...',
  },
  {
    active: false,
    budget: '$991.23',
    date: '10.05.2025',
    name: 'USDA Vietnam VetScienc...',
  },
  {
    active: false,
    budget: '$2,891.23',
    date: '10.05.2025',
    name: 'Food for Progress - Bangl...',
  },
  {
    active: false,
    budget: '$8,228.23',
    date: '10.05.2025',
    name: 'Centers of Excellence an...',
  },
  {
    active: false,
    budget: '$100.99',
    date: '10.05.2025',
    name: 'Ag Partnership with Japa...',
  },
];

export function ProjectsSidebar() {
  return (
    <aside className="w-72 shrink-0">
      <div className="sticky top-24">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="mb-4">
            <h2 className="text-gray-500 text-xs mb-3">MY PROJECTS</h2>
            <div className="flex items-center justify-between mb-3">
              <span>All Projects Dashboard</span>
              <button className="p-1 hover:bg-gray-100 rounded">
                {/* <Grid className="w-4 h-4" /> */}
                btn
              </button>
            </div>
            <div className="relative">
              <input
                className="pl-9 h-9 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search..."
                type="text"
              />
            </div>
          </div>

          <div className="space-y-1 max-h-[600px] overflow-y-auto">
            {projects.map((project, index) => (
              <button
                className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
                  project.active ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
                key={index}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="text-sm">{project.name}</span>
                </div>
                <div className="flex justify-between items-center text-xs text-gray-500">
                  <span>{project.budget}</span>
                  <span>{project.date}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}
