function define(script)
{
    script.Name = "bool_appearance";
    script.Type = "EventCondition";
    return 0;
}

// Check if the supplied appearance type and ID are set on the character
// - value1: appearance type
// - value2: appearance ID
function check(source, cState, dState, zone, value1, value2, params)
{
    local character = cState != null ? cState.GetEntity() : null;
    if(character == null)
    {
        return -1;
    }

    switch(value1)
    {
        case 0:
            // MiItemBasicData::EquipType_t::VIS_SKIN_TYPE
            return character.GetSkinType() == value2 ? 0 : -1;
        case 1:
            // MiItemBasicData::EquipType_t::VIS_HAIR_STYLE
            return character.GetHairType() == value2 ? 0 : -1;
        case 2:
            // MiItemBasicData::EquipType_t::VIS_EYE_TYPE
            return character.GetEyeType() == value2 ? 0 : -1;
        case 3:
            // MiItemBasicData::EquipType_t::VIS_FACE_TYPE
            return character.GetFaceType() == value2 ? 0 : -1;
        case 4:
            // MiItemBasicData::EquipType_t::VIS_EYE_COLOR_LEFT
            return character.GetLeftEyeColor() == value2 ? 0 : -1;
        case 5:
            // MiItemBasicData::EquipType_t::VIS_UNUSED1
            return -1;
        case 6:
            // MiItemBasicData::EquipType_t::VIS_UNUSED2
            return -1;
        case 7:
            // MiItemBasicData::EquipType_t::VIS_HAIR_COLOR
            return character.GetHairColor() == value2 ? 0 : -1;
        case 8:
            // MiItemBasicData::EquipType_t::VIS_EYE_COLOR_RIGHT
            return character.GetRightEyeColor() == value2 ? 0 : -1;
        case 9:
            // MiItemBasicData::EquipType_t::VIS_EYE_COLOR_BOTH
            return (character.GetLeftEyeColor() == value2 &&
                character.GetRightEyeColor() == value2) ? 0 : -1;
    }

    return -1;
}