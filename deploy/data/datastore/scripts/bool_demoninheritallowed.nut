function define(script)
{
    script.Name = "bool_demonInheritAllowed";
    script.Type = "EventCondition";
    return 0;
}

// Checks the currently summoned demon partner allows for a specified skill
// inheritance restriction.
// - value1 = Restriction ID
function check(source, cState, dState, zone, value1, value2, params)
{
    local devilData = dState != null ? dState.GetDevilData() : null;
    if(devilData)
    {
        local iRestrict = devilData.GetGrowth().GetInheritanceRestrictions();
        return (value1 >= 0 && (iRestrict & (1 << value1)) != 0) ? 0 : -1;
    }

    return -1;
}