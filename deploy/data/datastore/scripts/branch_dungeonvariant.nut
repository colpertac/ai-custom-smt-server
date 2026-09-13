function define(script)
{
    script.Name = "branch_dungeonVariant";
    script.Type = "EventBranchLogic";
    return 0;
}

// Branch on a dungeon's variant type.
function check(source, cState, dState, zone, params)
{
    local instance = zone != null ? zone.GetZoneInstance() : null;
    local variant = instance != null ? instance.GetVariant() : null;
    if(variant != null)
    {
        if(variant.InstanceType == ServerZoneInstanceVariant_InstanceType_t.TIME_TRIAL)
        {
            return 0;
        }
        else if(variant.InstanceType == ServerZoneInstanceVariant_InstanceType_t.DEMON_ONLY)
        {
            return 1;
        }
    }
    return -1;
}