export function ProjectDetails() {
  return (
    <section className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <h2 className="mb-4">Project Details</h2>
      <p className="text-gray-600 text-sm mb-6">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec cursus, turpis quis interdum viverra, nisi magna
        porttitor mauris, commodo hendrerit ipsum eu sapien eu eros ultrices. Cras eu lorem ullamcorper, sollicitudin ac
        ultrices, eu mauris porttitor consequat. Vestibulum ipsum mauris et lectus posuere tincidunt. Pellentesque
        habitant morbi.
      </p>
      <div className="grid grid-cols-5 gap-4">
        <div>
          <div className="text-xs text-gray-500 mb-1">Start Date</div>
          <div className="text-sm">05.23.2012</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">End Date</div>
          <div className="text-sm">08.23.2025</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">PM</div>
          <div className="text-sm text-blue-600 underline cursor-pointer">Janelle Kroll</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">PI</div>
          <div className="text-sm text-blue-600 underline cursor-pointer">Edward Staina</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">ID</div>
          <div className="text-sm">ADN100954-A0N0</div>
        </div>
      </div>
    </section>
  );
}
