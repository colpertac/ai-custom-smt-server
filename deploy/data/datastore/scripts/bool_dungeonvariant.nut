function define(script)
{
    script.Name = "bool_dungeonVariant";
    script.Type = "EventCondition";
    return 0;
}

// Check a dungeon's variant type.
// params[0] = A dungeon variant type. Acceptable values are in server_zone.xml
function check(source, cState, dState, zone, value1, value2, params)
{
    local instance = zone != null ? zone.GetZoneInstance() : null;
    local variant = instance != null ? instance.GetVariant() : null;
    if(variant != null)
    {
        switch(variant.InstanceType)
        {
            case ServerZoneInstanceVariant_InstanceType_t.NORMAL:
                // Handled below
                break;
            case ServerZoneInstanceVariant_InstanceType_t.TIME_TRIAL:
                return params[0] == "TIME_TRIAL" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.PVP:
                return params[0] == "PVP" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.DEMON_ONLY:
                return params[0] == "DEMON_ONLY" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.DIASPORA:
                return params[0] == "DIASPORA" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.MISSION:
                return params[0] == "MISSION" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.PENTALPHA:
                return params[0] == "PENTALPHA" ? 0 : -1;
            case ServerZoneInstanceVariant_InstanceType_t.DIGITALIZE:
                return params[0] == "DIGITALIZE" ? 0 : -1;
        }
    }

    return params[0] == "NORMAL" ? 0 : -1;
}