using Microsoft.Extensions.DependencyInjection;
using NetDaemon.AppModel;

namespace HaNetDaemon.Toolkit;

// Only relevant to a real, existing multi-project solution being built via RebuildApp (see its own
// doc comment) -- the generated wrapper for a plain apps/ folder never needs this, it lists this
// assembly itself. AddAppsFromAssembly must be called per-assembly (that's how NetDaemon itself
// discovers apps across a multi-project solution -- every domain's own Initializer does the same
// for its own assembly); a ProjectReference alone would build and copy this DLL but never scan it.
//
// Deliberately implements no interface (not even a solution's own IInitializer, if it has one):
// this class also gets compiled under NetDaemon's narrow source-deploy compiler (it lives right
// next to ControlApp/StatusApp/CodegenApp/RebuildApp), so it must never reference a type that only
// exists in a real, separately-compiled solution.
public class ToolkitInitializer
{
    public void Initialize(IServiceCollection services)
    {
        services.AddAppsFromAssembly(typeof(ToolkitInitializer).Assembly);
    }
}
